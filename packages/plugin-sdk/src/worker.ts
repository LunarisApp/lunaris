export const PLUGIN_WORKER_TASK_TIMEOUT_MS = 30_000;

const WORKER_TASK_REQUEST = "lunaris-worker-task-request";
const WORKER_TASK_RESULT = "lunaris-worker-task-result";

interface WorkerTaskRequest<TInput> {
  input: TInput;
  type: typeof WORKER_TASK_REQUEST;
}

type WorkerTaskResult<TOutput> =
  | {
      output: TOutput;
      type: typeof WORKER_TASK_RESULT;
    }
  | {
      error: { message: string; name: string };
      type: typeof WORKER_TASK_RESULT;
    };

interface PluginWorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  close(): void;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

export interface PluginWorkerTaskOptions {
  /** Cancels the task by terminating its worker. */
  signal?: AbortSignal;
  /** Maximum runtime in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number;
  /** Values transferred with the input instead of copied. */
  transfer?: readonly Transferable[];
}

function taskError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function serializedError(error: unknown): { message: string; name: string } {
  const value = taskError(error);
  return { message: value.message, name: value.name };
}

function transferredBuffers(value: unknown): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const seen = new WeakSet<object>();

  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object") return;
    if (item instanceof ArrayBuffer) {
      buffers.add(item);
      return;
    }
    if (ArrayBuffer.isView(item)) {
      if (item.buffer instanceof ArrayBuffer) buffers.add(item.buffer);
      return;
    }
    if (seen.has(item)) return;
    seen.add(item);
    if (item instanceof Map) {
      for (const [key, child] of item) {
        visit(key);
        visit(child);
      }
      return;
    }
    if (item instanceof Set) {
      for (const child of item) visit(child);
      return;
    }
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    for (const child of Object.values(item)) visit(child);
  };

  visit(value);
  return [...buffers];
}

function isWorkerTaskResult<TOutput>(
  value: unknown,
): value is WorkerTaskResult<TOutput> {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<WorkerTaskResult<TOutput>>;
  if (result.type !== WORKER_TASK_RESULT) return false;
  if (!("error" in result)) return "output" in result;
  return (
    Boolean(result.error) &&
    typeof result.error?.message === "string" &&
    typeof result.error?.name === "string"
  );
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Extension worker task aborted", "AbortError");
}

/** Run one isolated worker task. The worker is terminated after it settles. */
export function runPluginWorkerTask<TInput, TOutput>(
  createWorker: () => Worker,
  input: TInput,
  options: PluginWorkerTaskOptions = {},
): Promise<TOutput> {
  const timeoutMs = options.timeoutMs ?? PLUGIN_WORKER_TASK_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error("Worker task timeout must be positive"));
  }
  if (options.signal?.aborted) {
    return Promise.reject(abortError(options.signal));
  }

  let worker: Worker;
  try {
    worker = createWorker();
  } catch (error) {
    return Promise.reject(taskError(error));
  }

  return new Promise<TOutput>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeout !== undefined) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("messageerror", onMessageError);
      worker.terminate();
    };
    const finish = (result: { error: Error } | { output: TOutput }) => {
      if (settled) return;
      settled = true;
      cleanup();
      if ("error" in result) reject(result.error);
      else resolve(result.output);
    };
    const onAbort = () => finish({ error: abortError(options.signal!) });
    const onError = (event: ErrorEvent) =>
      finish({
        error:
          event.error instanceof Error
            ? event.error
            : new Error(event.message || "Extension worker task failed"),
      });
    const onMessageError = () =>
      finish({ error: new Error("Extension worker task response is unreadable") });
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isWorkerTaskResult<TOutput>(event.data)) {
        finish({ error: new Error("Extension worker task returned an invalid result") });
        return;
      }
      if ("error" in event.data) {
        const error = new Error(event.data.error.message);
        error.name = event.data.error.name;
        finish({ error });
      } else {
        finish({ output: event.data.output });
      }
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });
    worker.addEventListener("error", onError);
    worker.addEventListener("message", onMessage);
    worker.addEventListener("messageerror", onMessageError);
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    timeout = setTimeout(() => {
      const error = new Error(
        `Extension worker task timed out after ${timeoutMs.toLocaleString()}ms`,
      );
      error.name = "TimeoutError";
      finish({ error });
    }, timeoutMs);

    try {
      const request: WorkerTaskRequest<TInput> = {
        input,
        type: WORKER_TASK_REQUEST,
      };
      worker.postMessage(request, [...(options.transfer ?? [])]);
    } catch (error) {
      finish({ error: taskError(error) });
    }
  });
}

/** Expose one pure input/output handler from a dedicated worker module. */
export function exposePluginWorkerTask<TInput, TOutput>(
  handler: (input: TInput) => Promise<TOutput> | TOutput,
): void {
  const scope = globalThis as unknown as PluginWorkerScope;
  let started = false;

  scope.addEventListener("message", (event) => {
    if (started) return;
    const request = event.data as Partial<WorkerTaskRequest<TInput>> | undefined;
    if (!request || request.type !== WORKER_TASK_REQUEST || !("input" in request)) {
      scope.postMessage(
        {
          error: serializedError(new Error("Extension worker task request is invalid")),
          type: WORKER_TASK_RESULT,
        } satisfies WorkerTaskResult<never>,
        [],
      );
      scope.close();
      return;
    }
    started = true;
    void Promise.resolve().then(() => handler(request.input as TInput)).then(
      (output) => {
        try {
          scope.postMessage(
            { output, type: WORKER_TASK_RESULT } satisfies WorkerTaskResult<TOutput>,
            transferredBuffers(output),
          );
        } catch (error) {
          scope.postMessage(
            {
              error: serializedError(error),
              type: WORKER_TASK_RESULT,
            } satisfies WorkerTaskResult<never>,
            [],
          );
        } finally {
          scope.close();
        }
      },
      (error) => {
        scope.postMessage(
          {
            error: serializedError(error),
            type: WORKER_TASK_RESULT,
          } satisfies WorkerTaskResult<never>,
          [],
        );
        scope.close();
      },
    );
  });
}
