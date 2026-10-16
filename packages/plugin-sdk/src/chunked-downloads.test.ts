import { expect, it, vi } from "vitest";
import {
  PluginDownloadReceiver,
  saveRemoteChunks,
  MAX_PLUGIN_CHUNK_BYTES,
} from "./downloads";
it("cancels a stalled chunk iterator without waiting for next or return", async () => {
  const abort = new AbortController();
  const next = vi.fn(() => new Promise<IteratorResult<Uint8Array>>(() => {}));
  const close = vi.fn(() => new Promise<IteratorResult<Uint8Array>>(() => {}));
  const call = vi.fn(async (method: string) =>
    method === "downloads.begin" ? "id" : undefined
  );
  const task = saveRemoteChunks(call, {
    suggestedName: "data.csv",
    mimeType: "text/csv",
    signal: abort.signal,
    chunks: { [Symbol.asyncIterator]: () => ({ next, return: close }) },
  });
  await vi.waitFor(() => expect(next).toHaveBeenCalled());
  const rejected = expect(task).rejects.toThrow();
  abort.abort();
  await rejected;
  expect(call.mock.calls.map(([method]) => method)).toEqual([
    "downloads.begin",
    "downloads.abort",
  ]);
  expect(close).toHaveBeenCalledOnce();
});
it("cleans up a begin response arriving after cancellation", async () => {
  const abort = new AbortController();
  let resolve!: (value: string) => void;
  const call = vi.fn((method: string) =>
    method === "downloads.begin"
      ? new Promise<string>((r) => {
          resolve = r;
        })
      : Promise.resolve()
  );
  const task = saveRemoteChunks(call, {
    suggestedName: "data.csv",
    mimeType: "text/csv",
    signal: abort.signal,
    chunks: (async function* () {})(),
  });
  const rejected = expect(task).rejects.toThrow();
  abort.abort();
  await rejected;
  resolve("late");
  await Promise.resolve();
  expect(call).toHaveBeenCalledWith("downloads.abort", ["late"]);
});
it("keeps completing downloads scoped and aborts them on surface cleanup", async () => {
  let signal: AbortSignal | undefined;
  const receiver = new PluginDownloadReceiver({
    save: vi.fn(),
    saveChunks: (input) => {
      signal = input.signal;
      return new Promise((_, reject) =>
        signal!.addEventListener("abort", () => reject(signal!.reason), {
          once: true,
        })
      );
    },
  });
  const metadata = { mimeType: "text/csv", suggestedName: "data.csv" };
  const id = receiver.begin(metadata);
  receiver.write(id, new Uint8Array([1]).buffer);
  const completing = receiver.complete(id);
  const rejected = expect(completing).rejects.toThrow();
  expect(() => receiver.begin(metadata)).toThrow("already");
  expect(() => receiver.write(id, new ArrayBuffer(1))).toThrow("completing");
  await expect(receiver.complete(id)).rejects.toThrow("completing");
  receiver.clear();
  await rejected;
  expect(signal!.aborted).toBe(true);
});
it("reassembles chunked downloads and keeps the legacy save capability separate", async () => {
  const received: number[] = [];
  const save = vi.fn();
  const receiver = new PluginDownloadReceiver({
    save,
    saveChunks: async (input) => {
      for await (const bytes of input.chunks) {
        received.push(...bytes);
      }
    },
  });
  const id = receiver.begin({
    mimeType: "text/csv",
    suggestedName: "data.csv",
  });
  receiver.write(id, new Uint8Array([1, 2]).buffer);
  receiver.write(id, new Uint8Array([3]).buffer);
  await receiver.complete(id);
  expect(received).toEqual([1, 2, 3]);
  expect(save).not.toHaveBeenCalled();
  expect(() => receiver.write(id, new ArrayBuffer(1))).toThrow("Unknown");
});
it("rejects invalid metadata and oversized chunks and clears cancelled sessions", () => {
  const receiver = new PluginDownloadReceiver({
    save: vi.fn(),
    saveChunks: vi.fn(),
  });
  expect(() =>
    receiver.begin({ mimeType: "text/csv", suggestedName: "../data.csv" })
  ).toThrow();
  const id = receiver.begin({
    mimeType: "text/csv",
    suggestedName: "data.csv",
  });
  expect(() =>
    receiver.write(id, new ArrayBuffer(MAX_PLUGIN_CHUNK_BYTES + 1))
  ).toThrow("limit");
  const next = receiver.begin({
    mimeType: "text/csv",
    suggestedName: "next.csv",
  });
  receiver.clear();
  expect(() => receiver.write(next, new ArrayBuffer(1))).toThrow("Unknown");
});
it("splits caller chunks and aborts the host session when cancellation arrives", async () => {
  const abort = new AbortController();
  const calls: string[] = [];
  const call = vi.fn(async (method: string) => {
    calls.push(method);
    if (method === "downloads.begin") {
      return "id";
    }
    if (method === "downloads.write") {
      abort.abort();
    }
  });
  await expect(
    saveRemoteChunks(call, {
      mimeType: "text/csv",
      suggestedName: "data.csv",
      signal: abort.signal,
      chunks: (async function* () {
        yield new Uint8Array(MAX_PLUGIN_CHUNK_BYTES + 1);
      })(),
    })
  ).rejects.toThrow();
  expect(calls).toEqual([
    "downloads.begin",
    "downloads.write",
    "downloads.abort",
  ]);
});
