import {
  assertPluginDownloadInput,
  type PluginChunkedDownloadInput,
  type PluginDownloads,
} from "./runtime-context";
import type { SandboxWireValue } from "./sandbox-protocol";

export const MAX_PLUGIN_CHUNK_BYTES = 1024 * 1024;
export const MAX_PLUGIN_CHUNKED_DOWNLOAD_BYTES = 256 * 1024 * 1024;
interface PendingDownload {
  bytes: number;
  chunks: Uint8Array[];
  completing: boolean;
  controller: AbortController;
  mimeType: string;
  suggestedName: string;
  tailBytes: number;
  timer: ReturnType<typeof setTimeout>;
}
/** One receiver per mounted extension surface, behind downloads.write permission. */
export class PluginDownloadReceiver {
  private pending = new Map<string, PendingDownload>();
  constructor(private downloads: PluginDownloads) {}
  begin(input: { mimeType: string; suggestedName: string }): string {
    assertPluginDownloadInput({ ...input, data: new ArrayBuffer(0) });
    if (!this.downloads.saveChunks) {
      throw new Error("Chunked downloads are unavailable on this host");
    }
    if (this.pending.size) {
      throw new Error("A download is already being prepared");
    }
    const id = crypto.randomUUID();
    this.pending.set(id, {
      ...input,
      controller: new AbortController(),
      completing: false,
      bytes: 0,
      tailBytes: 0,
      chunks: [],
      timer: setTimeout(() => this.abort(id), 30_000),
    });
    return id;
  }
  write(id: string, chunk: ArrayBuffer): void {
    const pending = this.pending.get(id);
    if (!pending) {
      throw new Error("Unknown or expired download");
    }
    if (pending.completing) {
      throw new Error("Download is already completing");
    }
    if (
      !(chunk instanceof ArrayBuffer) ||
      chunk.byteLength > MAX_PLUGIN_CHUNK_BYTES ||
      pending.bytes + chunk.byteLength > MAX_PLUGIN_CHUNKED_DOWNLOAD_BYTES
    ) {
      this.abort(id);
      throw new Error("Download exceeds chunk or total size limit");
    }
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => this.abort(id), 30_000);
    pending.bytes += chunk.byteLength;
    const bytes = new Uint8Array(chunk);
    for (let offset = 0; offset < bytes.length; ) {
      if (
        !pending.chunks.length ||
        pending.tailBytes === MAX_PLUGIN_CHUNK_BYTES
      ) {
        pending.chunks.push(new Uint8Array(MAX_PLUGIN_CHUNK_BYTES));
        pending.tailBytes = 0;
      }
      const count = Math.min(
        bytes.length - offset,
        MAX_PLUGIN_CHUNK_BYTES - pending.tailBytes
      );
      pending.chunks
        .at(-1)!
        .set(bytes.subarray(offset, offset + count), pending.tailBytes);
      pending.tailBytes += count;
      offset += count;
    }
  }
  async complete(id: string): Promise<void> {
    const pending = this.pending.get(id);
    if (!pending) {
      throw new Error("Unknown or expired download");
    }
    if (pending.completing) {
      throw new Error("Download is already completing");
    }
    pending.completing = true;
    clearTimeout(pending.timer);
    try {
      await this.downloads.saveChunks!({
        mimeType: pending.mimeType,
        suggestedName: pending.suggestedName,
        signal: pending.controller.signal,
        chunks: (async function* () {
          for (let i = 0; i < pending.chunks.length; i++) {
            pending.controller.signal.throwIfAborted();
            yield i === pending.chunks.length - 1
              ? pending.chunks[i]!.subarray(0, pending.tailBytes)
              : pending.chunks[i]!;
          }
        })(),
      });
    } finally {
      this.abort(id);
    }
  }
  abort(id: string): void {
    const pending = this.pending.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      pending.controller.abort();
    }
    this.pending.delete(id);
  }
  clear(): void {
    for (const id of this.pending.keys()) {
      this.abort(id);
    }
  }
}
export async function saveRemoteChunks(
  call: (method: string, args: SandboxWireValue[]) => Promise<unknown>,
  input: PluginChunkedDownloadInput
): Promise<void> {
  input.signal?.throwIfAborted();
  let id: string | undefined;
  let abortSent = false;
  let iterator: AsyncIterator<Uint8Array> | undefined;
  let finished = false;
  const abortHost = () => {
    if (id && !abortSent) {
      abortSent = true;
      void call("downloads.abort", [id]).catch(() => undefined);
    }
  };
  const abortReason = () =>
    input.signal?.reason ??
    new DOMException("Download cancelled", "AbortError");
  let rejectAbort!: (reason: unknown) => void;
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    abortHost();
    rejectAbort(abortReason());
  };
  input.signal?.addEventListener("abort", onAbort, { once: true });
  const wait = <T>(operation: PromiseLike<T>): Promise<T> =>
    Promise.race([operation, cancelled]);
  try {
    await wait(
      call("downloads.begin", [
        { mimeType: input.mimeType, suggestedName: input.suggestedName },
      ]).then((value) => {
        if (typeof value !== "string") {
          throw new Error("Invalid download session");
        }
        id = value;
        // A late begin response still owns host buffers after the caller cancelled.
        if (input.signal?.aborted) {
          abortHost();
          throw abortReason();
        }
      })
    );
    let total = 0;
    iterator = input.chunks[Symbol.asyncIterator]();
    while (true) {
      const next = await wait(iterator.next());
      if (next.done) {
        finished = true;
        break;
      }
      const chunk = next.value;
      input.signal?.throwIfAborted();
      if (!(chunk instanceof Uint8Array)) {
        throw new Error("Download chunks must be byte arrays");
      }
      total += chunk.byteLength;
      if (total > MAX_PLUGIN_CHUNKED_DOWNLOAD_BYTES) {
        throw new Error("Download exceeds 256 MiB");
      }
      for (
        let offset = 0;
        offset < chunk.byteLength;
        offset += MAX_PLUGIN_CHUNK_BYTES
      ) {
        input.signal?.throwIfAborted();
        const part = chunk.slice(offset, offset + MAX_PLUGIN_CHUNK_BYTES);
        await wait(call("downloads.write", [id!, part.buffer]));
      }
    }
    input.signal?.throwIfAborted();
    await wait(call("downloads.complete", [id!]));
  } catch (error) {
    abortHost();
    throw error;
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
    // Async generators can queue return() behind a stalled next(). Cancellation
    // must release the caller immediately rather than await that external source.
    if (!finished && iterator?.return) {
      try {
        void Promise.resolve(iterator.return()).catch(() => undefined);
      } catch {
        /* best-effort iterator cleanup */
      }
    }
  }
}
