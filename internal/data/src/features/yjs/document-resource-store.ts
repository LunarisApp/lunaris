import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { log, parseError } from "evlog";
import { Doc } from "yjs";
import { YjsPowersyncProvider } from "./provider";
import { createYjsDocumentWithId, yjsDocumentExists } from "./services";

const DEFAULT_CACHE_GRACE_MS = 30_000;
const DEFAULT_PRELOAD_CONCURRENCY = 4;
const DEFAULT_PRELOAD_LRU_CAP = 30;

export type YjsPreloadPriority = "background" | "intent";
export type YjsCacheOutcome = "memory" | "shared" | "sqlite";
type ResourceStatus = "idle" | "loading" | "ready" | "failed" | "destroyed";

interface PreloadToken {
  active: boolean;
}

export interface YjsDocumentResource {
  db: AbstractPowerSyncDatabase;
  destroyTimer: ReturnType<typeof setTimeout> | null;
  doc: Doc;
  documentId: string;
  key: string;
  loadAbortController: AbortController;
  loadStartedAt?: number;
  mountRefs: number;
  preloadRefs: number;
  preloadTokens: Set<PreloadToken>;
  priority: YjsPreloadPriority;
  provider: YjsPowersyncProvider | null;
  queuedAt: number;
  ready: Promise<void>;
  rejectReady: (error: Error) => void;
  resolveReady: () => void;
  status: ResourceStatus;
  workspaceId: string;
}

export interface PreloadYjsDocumentArgs {
  db: AbstractPowerSyncDatabase;
  documentId: string;
  priority?: YjsPreloadPriority;
  userId?: string | null;
  workspaceId: string;
}

export interface PreloadYjsDocumentHandle {
  /** Resolves once the shared resource has emitted "synced". */
  done: Promise<void>;
  /** Move queued background work ahead of other background preloads. */
  promote: () => void;
  /** Release this preload hold; cleanup begins when all holds are gone. */
  release: () => void;
}

export interface WaitForYjsDocumentPersistenceInput {
  db: AbstractPowerSyncDatabase;
  documentId: string;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function resourceKey(workspaceId: string, documentId: string): string {
  return `${workspaceId}::${documentId}`;
}

/** Owns shared Y.Doc resources, preload scheduling, and lifecycle counters. */
export class YjsDocumentResourceStore {
  private readonly resourcesByDatabase = new WeakMap<
    AbstractPowerSyncDatabase,
    Map<string, YjsDocumentResource>
  >();

  private readonly allResources = new Set<YjsDocumentResource>();
  private readonly preloadLRU: YjsDocumentResource[] = [];
  private readonly preloadQueue: YjsDocumentResource[] = [];
  private preloadConcurrency = DEFAULT_PRELOAD_CONCURRENCY;
  private preloadInFlight = 0;
  private backgroundInFlight = 0;
  private preloadLruCap = DEFAULT_PRELOAD_LRU_CAP;

  get(
    db: AbstractPowerSyncDatabase,
    documentId: string,
    workspaceId: string
  ): YjsDocumentResource | undefined {
    return this.resourcesByDatabase
      .get(db)
      ?.get(resourceKey(workspaceId, documentId));
  }

  getOrCreate(
    db: AbstractPowerSyncDatabase,
    documentId: string,
    workspaceId: string,
    priority: YjsPreloadPriority
  ): { cacheOutcome: YjsCacheOutcome; resource: YjsDocumentResource } {
    const key = resourceKey(workspaceId, documentId);
    const resources = this.getDatabaseResources(db);
    const existing = resources.get(key);
    if (existing) {
      this.queue(existing, priority);
      return {
        cacheOutcome: existing.status === "ready" ? "memory" : "shared",
        resource: existing,
      };
    }

    const resource = this.createResource({
      db,
      documentId,
      key,
      priority,
      workspaceId,
    });
    // Publish before existence checks or provider construction begin.
    resources.set(key, resource);
    this.allResources.add(resource);
    this.queue(resource, priority);
    return { cacheOutcome: "sqlite", resource };
  }

  acquireMount(resource: YjsDocumentResource, userId?: string | null): void {
    resource.mountRefs++;
    resource.provider?.setUserId(userId);
    this.scheduleCleanup(resource);
  }

  releaseMount(resource: YjsDocumentResource): void {
    resource.mountRefs = Math.max(0, resource.mountRefs - 1);
    this.scheduleCleanup(resource);
  }

  preload(args: PreloadYjsDocumentArgs): PreloadYjsDocumentHandle {
    const { db, documentId, workspaceId } = args;
    const priority = args.priority ?? "background";
    const { resource } = this.getOrCreate(
      db,
      documentId,
      workspaceId,
      priority
    );
    const token: PreloadToken = { active: true };
    resource.preloadTokens.add(token);
    resource.preloadRefs++;
    this.touchLRU(resource);
    this.scheduleCleanup(resource);
    this.evictLRUIfOverCap(resource);

    const flags = { released: false, settled: false };
    let resolveDone!: () => void;
    let rejectDone!: (error: unknown) => void;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    done.catch(() => undefined);

    const release = () => {
      if (flags.released) return;
      flags.released = true;
      this.releasePreloadToken(resource, token);
      if (!flags.settled) {
        flags.settled = true;
        resolveDone();
      }
    };

    resource.ready
      .then(() => {
        if (flags.released || flags.settled) return;
        flags.settled = true;
        resolveDone();
      })
      .catch((error: unknown) => {
        if (flags.released || flags.settled) return;
        flags.settled = true;
        rejectDone(error);
      });

    return {
      done,
      promote: () => this.queue(resource, "intent"),
      release,
    };
  }

  async waitForPersistence({
    db,
    documentId,
  }: WaitForYjsDocumentPersistenceInput): Promise<void> {
    const providers = Array.from(this.allResources)
      .filter(
        (resource) =>
          resource.db === db &&
          resource.documentId === documentId &&
          resource.mountRefs > 0 &&
          resource.provider
      )
      .map((resource) => resource.provider!);

    await Promise.all(providers.map((provider) => provider.waitForPersistence()));
  }

  setLimitsForTests(options: { concurrency?: number; lru?: number }): void {
    if (options.lru !== undefined) this.preloadLruCap = options.lru;
    if (options.concurrency !== undefined) {
      this.preloadConcurrency = options.concurrency;
    }
  }

  resetForTests(): void {
    for (const resource of [...this.allResources]) this.destroy(resource);
    this.preloadLRU.length = 0;
    this.preloadQueue.length = 0;
    this.preloadInFlight = 0;
    this.backgroundInFlight = 0;
    this.preloadLruCap = DEFAULT_PRELOAD_LRU_CAP;
    this.preloadConcurrency = DEFAULT_PRELOAD_CONCURRENCY;
  }

  getStateForTests() {
    return {
      cacheSize: this.allResources.size,
      entries: Array.from(this.allResources).map((resource) => ({
        key: resource.key,
        preloadCount: resource.preloadRefs,
        refCount: resource.mountRefs,
        synced: resource.status === "ready",
      })),
      inFlight: this.preloadInFlight,
      lru: this.preloadLRU.map((resource) => resource.key),
      queued: this.preloadQueue.length,
    };
  }

  private createResource(input: {
    db: AbstractPowerSyncDatabase;
    documentId: string;
    key: string;
    priority: YjsPreloadPriority;
    workspaceId: string;
  }): YjsDocumentResource {
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    ready.catch(() => undefined);

    return {
      ...input,
      destroyTimer: null,
      doc: new Doc(),
      loadAbortController: new AbortController(),
      mountRefs: 0,
      preloadRefs: 0,
      preloadTokens: new Set(),
      provider: null,
      queuedAt: performance.now(),
      ready,
      rejectReady,
      resolveReady,
      status: "idle",
    };
  }

  private getDatabaseResources(db: AbstractPowerSyncDatabase) {
    let resources = this.resourcesByDatabase.get(db);
    if (!resources) {
      resources = new Map();
      this.resourcesByDatabase.set(db, resources);
    }
    return resources;
  }

  private queue(
    resource: YjsDocumentResource,
    priority: YjsPreloadPriority
  ): void {
    if (resource.status !== "idle") return;
    if (priority === "intent") resource.priority = "intent";
    const existingIndex = this.preloadQueue.indexOf(resource);
    if (existingIndex >= 0) this.preloadQueue.splice(existingIndex, 1);
    if (resource.priority === "intent") this.preloadQueue.unshift(resource);
    else this.preloadQueue.push(resource);
    this.drainQueue();
  }

  private drainQueue(): void {
    while (
      this.preloadInFlight < this.preloadConcurrency &&
      this.preloadQueue.length > 0
    ) {
      // Leave capacity for a document the user actually wants to open.
      const backgroundLimit = Math.max(1, this.preloadConcurrency - 1);
      const index = this.preloadQueue.findIndex(
        (resource) =>
          resource.priority === "intent" ||
          this.backgroundInFlight < backgroundLimit
      );
      if (index < 0) break;
      const [resource] = this.preloadQueue.splice(index, 1);
      if (!resource) break;
      if (resource.status !== "idle") continue;
      const background = resource.priority === "background";
      if (background) this.backgroundInFlight++;
      this.preloadInFlight++;
      void this.load(resource).finally(() => {
        this.preloadInFlight--;
        if (background) this.backgroundInFlight--;
        this.drainQueue();
      });
    }
  }

  private async load(resource: YjsDocumentResource): Promise<void> {
    if (resource.status !== "idle") return resource.ready;
    resource.status = "loading";
    resource.loadStartedAt = performance.now();
    try {
      await this.ensureDocumentExists(resource);
      if (this.isDestroyed(resource)) return;

      const provider = new YjsPowersyncProvider(
        resource.doc,
        resource.db,
        resource.documentId,
        resource.workspaceId
      );
      resource.provider = provider;
      await this.waitForProvider(provider, resource.loadAbortController.signal);
      if (this.isDestroyed(resource)) return;
      resource.status = "ready";
      resource.resolveReady();
    } catch (error) {
      if (this.isDestroyed(resource)) return;
      this.fail(resource, error);
    }
  }

  private async ensureDocumentExists(
    resource: YjsDocumentResource
  ): Promise<void> {
    if (await yjsDocumentExists(resource.db, resource.documentId)) return;
    try {
      await createYjsDocumentWithId(
        resource.db,
        resource.documentId,
        resource.workspaceId
      );
    } catch (createError) {
      if (!(await yjsDocumentExists(resource.db, resource.documentId))) {
        throw createError;
      }
    }
  }

  private waitForProvider(
    provider: YjsPowersyncProvider,
    signal: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      function cleanup() {
        provider.off("synced", onSynced);
        provider.off("error", onError);
        signal.removeEventListener("abort", onAbort);
      }
      function settle(callback: () => void) {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      }
      function onSynced() {
        settle(resolve);
      }
      function onError(error: Error) {
        settle(() => reject(error));
      }
      function onAbort() {
        settle(() => reject(new Error("Yjs resource released")));
      }
      provider.on("synced", onSynced);
      provider.on("error", onError);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }

  private fail(resource: YjsDocumentResource, error: unknown): void {
    const normalized = normalizeError(error);
    resource.status = "failed";
    log.error({
      tag: "YjsDoc",
      msg: "resource load failed",
      documentId: resource.documentId,
      error: parseError(normalized),
    });
    resource.rejectReady(normalized);
    this.destroy(resource, normalized);
  }

  private isDestroyed(resource: YjsDocumentResource): boolean {
    return resource.status === "destroyed";
  }

  private destroy(resource: YjsDocumentResource, error?: Error): void {
    if (resource.status === "destroyed") return;
    const previousStatus = resource.status;
    resource.status = "destroyed";
    if (resource.destroyTimer) clearTimeout(resource.destroyTimer);
    resource.destroyTimer = null;
    this.removeFromLRU(resource);
    const queuedIndex = this.preloadQueue.indexOf(resource);
    if (queuedIndex >= 0) this.preloadQueue.splice(queuedIndex, 1);
    this.getDatabaseResources(resource.db).delete(resource.key);
    this.allResources.delete(resource);
    resource.loadAbortController.abort();
    resource.provider?.destroy();
    resource.doc.destroy();
    if (previousStatus !== "ready" && previousStatus !== "failed") {
      resource.rejectReady(error ?? new Error("Yjs resource released"));
    }
  }

  private scheduleCleanup(resource: YjsDocumentResource): void {
    if (resource.mountRefs > 0 || resource.preloadRefs > 0) {
      if (resource.destroyTimer) clearTimeout(resource.destroyTimer);
      resource.destroyTimer = null;
      return;
    }
    if (resource.destroyTimer) clearTimeout(resource.destroyTimer);
    resource.destroyTimer = setTimeout(() => {
      if (resource.mountRefs === 0 && resource.preloadRefs === 0) {
        this.destroy(resource);
      }
    }, DEFAULT_CACHE_GRACE_MS);
  }

  private releasePreloadToken(
    resource: YjsDocumentResource,
    token: PreloadToken
  ): void {
    if (!token.active) return;
    token.active = false;
    resource.preloadTokens.delete(token);
    resource.preloadRefs = Math.max(0, resource.preloadRefs - 1);
    if (resource.preloadRefs === 0) this.removeFromLRU(resource);
    this.cancelQueuedLoadIfUnused(resource);
    this.scheduleCleanup(resource);
  }

  private cancelQueuedLoadIfUnused(resource: YjsDocumentResource): void {
    if (
      resource.status !== "idle" ||
      resource.mountRefs > 0 ||
      resource.preloadRefs > 0
    ) {
      return;
    }
    const index = this.preloadQueue.indexOf(resource);
    if (index >= 0) this.preloadQueue.splice(index, 1);
  }

  private touchLRU(resource: YjsDocumentResource): void {
    this.removeFromLRU(resource);
    this.preloadLRU.push(resource);
  }

  private removeFromLRU(resource: YjsDocumentResource): void {
    const index = this.preloadLRU.indexOf(resource);
    if (index >= 0) this.preloadLRU.splice(index, 1);
  }

  private evictLRUIfOverCap(keep: YjsDocumentResource): void {
    while (this.preloadLRU.length > this.preloadLruCap) {
      const victim = this.preloadLRU.shift();
      if (!victim || victim === keep) continue;
      for (const token of victim.preloadTokens) token.active = false;
      victim.preloadTokens.clear();
      victim.preloadRefs = 0;
      this.cancelQueuedLoadIfUnused(victim);
      this.scheduleCleanup(victim);
    }
  }
}

const resourceStore = new YjsDocumentResourceStore();

export function preloadYjsDocument(
  args: PreloadYjsDocumentArgs
): PreloadYjsDocumentHandle {
  return resourceStore.preload(args);
}

export function waitForYjsDocumentPersistence(
  input: WaitForYjsDocumentPersistenceInput
): Promise<void> {
  return resourceStore.waitForPersistence(input);
}

export function _setPreloadLimitsForTests(options: {
  concurrency?: number;
  lru?: number;
}): void {
  resourceStore.setLimitsForTests(options);
}

export function _resetYDocCacheForTests(): void {
  resourceStore.resetForTests();
}

export function _getPreloadStateForTests() {
  return resourceStore.getStateForTests();
}

export { resourceStore as yjsDocumentResourceStore };
