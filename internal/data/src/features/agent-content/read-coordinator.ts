import type {
  AbstractPowerSyncDatabase,
  SyncStream,
  SyncStreamDescription,
  SyncStreamSubscription,
} from "@powersync/common";
import type {
  ContentRequestOptions,
  ContentSnapshot,
} from "@repo/agent-contracts";

const DEFAULT_TIMEOUT_MS = 29_000;
const DEFAULT_TTL_SECONDS = 300;

export type DeviceReadTarget =
  | { kind: "workspace-content"; workspaceId: string }
  | { kind: "workspaces" }
  | { kind: "organization-resources" };

export interface DeviceReadCoordinator {
  dispose(): void;
  resolve(
    target: DeviceReadTarget,
    options?: ContentRequestOptions
  ): Promise<ContentSnapshot>;
}

export function createDeviceReadCoordinator(
  db: AbstractPowerSyncDatabase,
  options: { timeoutMs?: number; ttlSeconds?: number } = {}
): DeviceReadCoordinator {
  const lifecycle = new AbortController();
  const pending = new Map<string, Promise<ContentSnapshot>>();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  const snapshot = (target: DeviceReadTarget) =>
    mergeContentSnapshots(
      ...streamsFor(db, target).map((stream) => streamSnapshot(db, stream)),
      ...(target.kind === "workspace-content"
        ? streamsFor(db, { kind: "organization-resources" }).map((stream) =>
            streamSnapshot(db, stream)
          )
        : [])
    );

  const confirm = (target: DeviceReadTarget): Promise<ContentSnapshot> => {
    const key = targetKey(target);
    const existing = pending.get(key);
    if (existing) {
      return existing;
    }
    const confirmationOptions = {
      lifecycle: lifecycle.signal,
      timeoutMs,
      ttl,
    };
    const confirmation: Promise<ContentSnapshot> =
      target.kind === "workspace-content"
        ? Promise.all([
            confirmStreams(db, target, confirmationOptions),
            confirm({ kind: "organization-resources" }),
          ]).then((snapshots) => mergeContentSnapshots(...snapshots))
        : confirmStreams(db, target, confirmationOptions);
    const promise: Promise<ContentSnapshot> = confirmation.finally(() => {
      if (pending.get(key) === promise) {
        pending.delete(key);
      }
    });
    pending.set(key, promise);
    return promise;
  };

  return {
    dispose() {
      lifecycle.abort();
      pending.clear();
    },
    async resolve(target, request = {}) {
      if (request.consistency === "cached") {
        return snapshot(target);
      }
      return waitWithSignal(confirm(target), request.signal);
    },
  };
}

export function localContentSnapshot(): ContentSnapshot {
  return {
    completeness: "complete",
    confirmedAt: new Date().toISOString(),
    syncState: "current",
  };
}

export function mergeContentSnapshots(
  ...snapshots: ContentSnapshot[]
): ContentSnapshot {
  const confirmed = snapshots
    .flatMap((snapshot) => (snapshot.confirmedAt ? [snapshot.confirmedAt] : []))
    .sort();
  return {
    completeness: snapshots.every(
      (snapshot) => snapshot.completeness === "complete"
    )
      ? "complete"
      : "partial",
    confirmedAt: confirmed[0] ?? null,
    syncState: snapshots.every((snapshot) => snapshot.syncState === "current")
      ? "current"
      : snapshots.some((snapshot) => snapshot.syncState === "stale")
        ? "stale"
        : "unknown",
  };
}

async function confirmStreams(
  db: AbstractPowerSyncDatabase,
  target: DeviceReadTarget,
  options: {
    lifecycle: AbortSignal;
    timeoutMs: number;
    ttl: number;
  }
) {
  const streams = streamsFor(db, target);
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = AbortSignal.any([options.lifecycle, timeout]);
  const subscriptionPromises = streams.map(async (stream) =>
    stream.subscribe({
      priority: 0,
      ttl: options.ttl,
    })
  );
  let subscriptions: SyncStreamSubscription[] = [];
  try {
    subscriptions = await waitWithSignal(
      Promise.all(subscriptionPromises),
      signal
    );
    await db.waitForStatus(
      (status) =>
        status.connected || status.dataFlowStatus.downloadError !== undefined,
      signal
    );
    assertSyncAvailable(db, signal);
    await waitWithSignal(
      Promise.all(
        subscriptions.map((subscription) =>
          subscription.waitForFirstSync(signal)
        )
      ),
      signal
    );
    assertSyncAvailable(db, signal);
    const snapshot = mergeContentSnapshots(
      ...subscriptions.map((subscription) => streamSnapshot(db, subscription))
    );
    if (snapshot.completeness !== "complete") {
      throw incompleteSync();
    }
    return snapshot;
  } catch (error) {
    if (isExposedError(error)) {
      throw error;
    }
    throw incompleteSync();
  } finally {
    if (subscriptions.length === subscriptionPromises.length) {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    } else {
      for (const subscription of subscriptionPromises) {
        subscription.then(
          (lateSubscription) => lateSubscription.unsubscribe(),
          () => undefined
        );
      }
    }
  }
}

function assertSyncAvailable(
  db: AbstractPowerSyncDatabase,
  signal: AbortSignal
) {
  if (
    signal.aborted ||
    !db.currentStatus.connected ||
    db.currentStatus.dataFlowStatus.downloadError
  ) {
    throw incompleteSync();
  }
}

function streamsFor(
  db: AbstractPowerSyncDatabase,
  target: DeviceReadTarget
): SyncStream[] {
  if (target.kind === "workspace-content") {
    return [
      db.syncStream("workspace_content", { workspace_id: target.workspaceId }),
    ];
  }
  return [db.syncStream("workspace_index")];
}

function streamSnapshot(
  db: AbstractPowerSyncDatabase,
  stream: SyncStreamDescription
): ContentSnapshot {
  const status = db.currentStatus.forStream(stream)?.subscription;
  const confirmedAt = toIsoString(status?.lastSyncedAt);
  const retained =
    status?.isDefault ||
    status?.active ||
    (status?.expiresAt !== null &&
      status?.expiresAt !== undefined &&
      status.expiresAt.getTime() > Date.now());
  const complete = status?.hasSynced === true && retained;
  return {
    completeness: complete ? "complete" : "partial",
    confirmedAt,
    syncState:
      complete && db.currentStatus.connected
        ? "current"
        : confirmedAt
          ? "stale"
          : "unknown",
  };
}

function toIsoString(date: Date | null | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function targetKey(target: DeviceReadTarget) {
  return target.kind === "workspace-content"
    ? `${target.kind}:${target.workspaceId}`
    : target.kind;
}

function waitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(incompleteSync());
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(incompleteSync());
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

function incompleteSync() {
  return Object.assign(
    new Error("Required Desktop content has not finished syncing"),
    {
      code: "INCOMPLETE_SYNC",
      exposeToAgent: true,
      status: 409,
    }
  );
}

function isExposedError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "exposeToAgent" in error &&
    error.exposeToAgent === true
  );
}
