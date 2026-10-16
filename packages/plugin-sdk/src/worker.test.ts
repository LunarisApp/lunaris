import { afterEach, describe, expect, it, vi } from "vitest";
import { exposePluginWorkerTask, runPluginWorkerTask } from "./worker";

type WorkerListener = (event: never) => void;

class FakeWorker {
  readonly listeners = new Map<string, Set<WorkerListener>>();
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();

  addEventListener(type: string, listener: WorkerListener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as never);
    }
  }

  removeEventListener(type: string, listener: WorkerListener) {
    this.listeners.get(type)?.delete(listener);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("runPluginWorkerTask", () => {
  it("returns one result and terminates its worker", async () => {
    const worker = new FakeWorker();
    const task = runPluginWorkerTask<{ value: number }, number>(
      () => worker as unknown as Worker,
      { value: 21 }
    );

    expect(worker.postMessage).toHaveBeenCalledWith(
      { input: { value: 21 }, type: "lunaris-worker-task-request" },
      []
    );
    worker.emit("message", {
      data: { output: 42, type: "lunaris-worker-task-result" },
    });

    await expect(task).resolves.toBe(42);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(
      [...worker.listeners.values()].every((value) => value.size === 0)
    ).toBe(true);
  });

  it("reconstructs worker errors", async () => {
    const worker = new FakeWorker();
    const task = runPluginWorkerTask<null, never>(
      () => worker as unknown as Worker,
      null
    );
    worker.emit("message", {
      data: {
        error: { message: "Render failed", name: "PdfError" },
        type: "lunaris-worker-task-result",
      },
    });

    await expect(task).rejects.toMatchObject({
      message: "Render failed",
      name: "PdfError",
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects construction and invalid message failures", async () => {
    await expect(
      runPluginWorkerTask(() => {
        throw new Error("Workers unavailable");
      }, null)
    ).rejects.toThrow("Workers unavailable");

    const worker = new FakeWorker();
    const task = runPluginWorkerTask(() => worker as unknown as Worker, null);
    worker.emit("message", { data: { output: true } });
    await expect(task).rejects.toThrow("invalid result");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("transfers selected input values", () => {
    const worker = new FakeWorker();
    const input = new ArrayBuffer(4);
    const task = runPluginWorkerTask(() => worker as unknown as Worker, input, {
      transfer: [input],
    });

    expect(worker.postMessage).toHaveBeenCalledWith(
      { input, type: "lunaris-worker-task-request" },
      [input]
    );
    worker.emit("message", {
      data: { output: null, type: "lunaris-worker-task-result" },
    });
    return task;
  });

  it("terminates when posting input fails", async () => {
    const worker = new FakeWorker();
    worker.postMessage.mockImplementationOnce(() => {
      throw new DOMException("Input cannot be cloned", "DataCloneError");
    });

    await expect(
      runPluginWorkerTask(() => worker as unknown as Worker, null)
    ).rejects.toMatchObject({ name: "DataCloneError" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates aborted tasks", async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const task = runPluginWorkerTask(() => worker as unknown as Worker, null, {
      signal: controller.signal,
    });

    controller.abort();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates when construction aborts the task", async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const task = runPluginWorkerTask(
      () => {
        controller.abort();
        return worker as unknown as Worker;
      },
      null,
      { signal: controller.signal }
    );

    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates timed-out tasks", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const task = runPluginWorkerTask(() => worker as unknown as Worker, null, {
      timeoutMs: 10,
    });
    const expectation = expect(task).rejects.toMatchObject({
      name: "TimeoutError",
    });

    await vi.advanceTimersByTimeAsync(10);
    await expectation;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});

describe("exposePluginWorkerTask", () => {
  it("posts results with nested ArrayBuffers transferred", async () => {
    let receive: ((event: MessageEvent<unknown>) => void) | undefined;
    const postMessage = vi.fn();
    const close = vi.fn();
    vi.stubGlobal(
      "addEventListener",
      vi.fn((_type, listener) => {
        receive = listener;
      })
    );
    vi.stubGlobal("postMessage", postMessage);
    vi.stubGlobal("close", close);
    const output = {
      data: new ArrayBuffer(8),
      mapped: new Map([["buffer", new ArrayBuffer(4)]]),
      view: new Uint8Array(2),
    };

    exposePluginWorkerTask(async (input: number) => ({ ...output, input }));
    receive?.({
      data: { input: 7, type: "lunaris-worker-task-request" },
    } as MessageEvent<unknown>);
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());

    expect(postMessage).toHaveBeenCalledWith(
      {
        output: { ...output, input: 7 },
        type: "lunaris-worker-task-result",
      },
      [output.data, output.mapped.get("buffer"), output.view.buffer]
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("serializes handler failures", async () => {
    let receive: ((event: MessageEvent<unknown>) => void) | undefined;
    const postMessage = vi.fn();
    vi.stubGlobal(
      "addEventListener",
      vi.fn((_type, listener) => {
        receive = listener;
      })
    );
    vi.stubGlobal("postMessage", postMessage);
    vi.stubGlobal("close", vi.fn());

    exposePluginWorkerTask(() => {
      const error = new Error("Nope");
      error.name = "TaskError";
      throw error;
    });
    receive?.({
      data: { input: null, type: "lunaris-worker-task-request" },
    } as MessageEvent<unknown>);
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());

    expect(postMessage).toHaveBeenCalledWith(
      {
        error: { message: "Nope", name: "TaskError" },
        type: "lunaris-worker-task-result",
      },
      []
    );
  });
});
