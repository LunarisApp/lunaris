import posthog from "posthog-js";

export type ResourceOpenKind = "deep_link" | "loaded" | "new" | "unloaded";
export type ResourceOpenCacheOutcome =
  | "loaded"
  | "memory"
  | "shared"
  | "sqlite"
  | "unknown";

interface ResourceOpenAttempt {
  cacheOutcome: ResourceOpenCacheOutcome;
  committedAt?: number;
  dataAt?: number;
  frame?: number;
  openKind: ResourceOpenKind;
  panelAt?: number;
  resourceId: string;
  resourceTypeId: string;
  sampled: boolean;
  stageMs: Partial<Record<ResourceOpenStage, number>>;
  startAt: number;
  timeout?: ReturnType<typeof setTimeout>;
}

export type ResourceOpenStage = "queue_wait" | "module" | "resolution";

interface StartResourceOpenInput {
  cacheOutcome?: ResourceOpenCacheOutcome;
  openKind: ResourceOpenKind;
  resourceId: string;
  resourceTypeId: string;
}

const ATTEMPT_TTL_MS = 5_000;
const SAMPLE_RATE = 0.1;
const TIMING_MARKS = {
  dataReady: "resource-open:data-ready",
  failure: "resource-open:failure",
  panelMounted: "resource-open:panel-mounted",
  ready: "resource-open:ready",
  start: "resource-open:start",
} as const;

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function mark(name: string): void {
  globalThis.performance?.mark(name);
}

function measure(name: string, start: number, end: number): void {
  try {
    globalThis.performance?.measure(name, { end, start });
  } catch {
    // Older WebViews can lack numeric PerformanceMeasureOptions.
  }
}

function buildTelemetryProperties(
  attempt: ResourceOpenAttempt,
  end: number,
  success: boolean,
  failureStage?: string
) {
  const panelAt = attempt.panelAt ?? end;
  const dataAt = attempt.dataAt ?? panelAt;
  return {
    cache_outcome: attempt.cacheOutcome,
    queue_wait_ms: attempt.stageMs.queue_wait,
    module_ms: attempt.stageMs.module,
    resolution_ms: attempt.stageMs.resolution,
    visible_ready_ms: success ? Math.max(0, end - attempt.startAt) : undefined,
    paint_wait_ms:
      attempt.committedAt === undefined
        ? undefined
        : Math.max(0, end - attempt.committedAt),
    data_ms: Math.max(0, dataAt - attempt.startAt),
    failure_stage: failureStage,
    open_kind: attempt.openKind,
    panel_ms: Math.max(0, panelAt - attempt.startAt),
    resource_type_id: attempt.resourceTypeId,
    renderer_ms: Math.max(0, end - dataAt),
    success,
    total_ms: Math.max(0, end - attempt.startAt),
  };
}

/** Tracks concurrent resource-open attempts without exposing identity fields. */
class ResourceOpenAttemptTracker {
  private readonly attempts = new Map<string, ResourceOpenAttempt>();

  has(resourceId: string): boolean {
    return this.attempts.has(resourceId);
  }

  start(input: StartResourceOpenInput): void {
    const previous = this.attempts.get(input.resourceId);
    if (previous) this.remove(previous);

    const attempt: ResourceOpenAttempt = {
      cacheOutcome: input.cacheOutcome ?? "unknown",
      resourceId: input.resourceId,
      openKind: input.openKind,
      resourceTypeId: input.resourceTypeId,
      sampled:
        import.meta.env.MODE === "production" && Math.random() < SAMPLE_RATE,
      startAt: now(),
      stageMs: {},
    };
    attempt.timeout = setTimeout(
      () => this.finish(attempt, false, "timeout"),
      ATTEMPT_TTL_MS
    );
    this.attempts.set(input.resourceId, attempt);
    mark(TIMING_MARKS.start);
  }

  markPanelMounted(resourceId: string, dataReady = false): void {
    const attempt = this.attempts.get(resourceId);
    if (!attempt || attempt.panelAt !== undefined) return;
    attempt.panelAt = now();
    if (dataReady && attempt.dataAt === undefined) {
      attempt.dataAt = attempt.panelAt;
    }
    mark(TIMING_MARKS.panelMounted);
  }

  markDataReady(
    resourceId: string,
    cacheOutcome?: ResourceOpenCacheOutcome,
    queueTiming?: { queuedAt: number; loadStartedAt: number }
  ): void {
    const attempt = this.attempts.get(resourceId);
    if (!attempt || attempt.dataAt !== undefined) return;
    attempt.dataAt = now();
    if (queueTiming) {
      attempt.stageMs.queue_wait = Math.max(
        0,
        queueTiming.loadStartedAt -
          Math.max(attempt.startAt, queueTiming.queuedAt)
      );
    }
    if (cacheOutcome) attempt.cacheOutcome = cacheOutcome;
    mark(TIMING_MARKS.dataReady);
  }

  ready(resourceId: string): void {
    const attempt = this.attempts.get(resourceId);
    if (!attempt || attempt.committedAt !== undefined) return;
    attempt.committedAt = now();
    // Two animation frames include a rendering opportunity after React's commit.
    // This is a paint proxy, not proof that an arbitrary hidden panel was visible.
    attempt.frame = requestAnimationFrame(() => {
      attempt.frame = requestAnimationFrame(() => {
        if (this.attempts.get(resourceId) !== attempt) return;
        this.finish(attempt, true);
      });
    });
  }

  stage(resourceId: string, stage: ResourceOpenStage): () => void {
    const attempt = this.attempts.get(resourceId);
    const start = now();
    let completed = false;
    return () => {
      if (!attempt || completed || this.attempts.get(resourceId) !== attempt)
        return;
      completed = true;
      const end = now();
      attempt.stageMs[stage] = (attempt.stageMs[stage] ?? 0) + end - start;
      measure(`resource-open:${stage}`, start, end);
    };
  }

  fail(resourceId: string, failureStage: string): void {
    const attempt = this.attempts.get(resourceId);
    if (attempt) this.finish(attempt, false, failureStage);
  }

  resetForTests(): void {
    for (const attempt of this.attempts.values()) this.remove(attempt);
  }

  private finish(
    attempt: ResourceOpenAttempt,
    success: boolean,
    failureStage?: string
  ): void {
    if (this.attempts.get(attempt.resourceId) !== attempt) return;
    const end = now();
    const panelAt = attempt.panelAt ?? end;
    const dataAt = attempt.dataAt ?? panelAt;
    measure("resource-open:panel", attempt.startAt, panelAt);
    measure("resource-open:data", attempt.startAt, dataAt);
    measure("resource-open:renderer", dataAt, end);
    measure("resource-open:total", attempt.startAt, end);
    mark(success ? TIMING_MARKS.ready : TIMING_MARKS.failure);

    if (attempt.sampled) {
      posthog.capture(
        "resource_open_performance",
        buildTelemetryProperties(attempt, end, success, failureStage)
      );
    }
    this.remove(attempt);
  }

  private remove(attempt: ResourceOpenAttempt): void {
    if (attempt.timeout) clearTimeout(attempt.timeout);
    if (attempt.frame !== undefined) cancelAnimationFrame(attempt.frame);
    this.attempts.delete(attempt.resourceId);
  }
}

const resourceOpenAttemptTracker = new ResourceOpenAttemptTracker();

export function startResourceOpen(input: StartResourceOpenInput): void {
  resourceOpenAttemptTracker.start(input);
}

export function hasPendingResourceOpen(resourceId: string): boolean {
  return resourceOpenAttemptTracker.has(resourceId);
}

export function markResourceOpenPanelMounted(
  resourceId: string,
  dataReady = false
): void {
  resourceOpenAttemptTracker.markPanelMounted(resourceId, dataReady);
}

export function markResourceOpenDataReady(
  resourceId: string,
  cacheOutcome?: ResourceOpenCacheOutcome,
  queueTiming?: { queuedAt: number; loadStartedAt: number }
): void {
  resourceOpenAttemptTracker.markDataReady(
    resourceId,
    cacheOutcome,
    queueTiming
  );
}

export function reportResourceOpenReady(resourceId: string): void {
  resourceOpenAttemptTracker.ready(resourceId);
}

export function reportResourceOpenFailure(
  id: string,
  failureStage: string,
): void {
  resourceOpenAttemptTracker.fail(id, failureStage);
}

/** Internal test cleanup; not re-exported from package entry point. */
export function _resetResourceOpenPerformanceForTests(): void {
  resourceOpenAttemptTracker.resetForTests();
}

/** Completion callbacks cannot attribute an old async load to a newer attempt. */
export function startResourceOpenStage(
  resourceId: string,
  stage: ResourceOpenStage
): () => void {
  return resourceOpenAttemptTracker.stage(resourceId, stage);
}
