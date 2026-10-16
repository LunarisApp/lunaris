/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttachmentRecord } from "@powersync/common";
import {
  FILE_CHUNK_BYTES,
  type IndexedDbFileStorageAdapter,
} from "../../storage/indexeddb-file-storage";
import type { ApiClient } from "../../http";
import { type FileTransferState, uploadChunks } from "./chunked-upload";

afterEach(() => vi.unstubAllGlobals());
function harness(size: number) {
  const persisted = new Map<string, FileTransferState>();
  const storage = {
    readTransfer: vi.fn(async (id: string) => persisted.get(id)),
    writeTransfer: vi.fn(async (id: string, value: FileTransferState) => {
      persisted.set(id, structuredClone(value));
    }),
    deleteTransfer: vi.fn(async (id: string) => {
      persisted.delete(id);
    }),
  } as unknown as IndexedDbFileStorageAdapter;
  const uploaded = new Set<number>();
  const signed: number[] = [];
  let complete = false;
  const post = vi.fn(
    async (path: string, options?: { body?: Record<string, unknown> }) => {
      if (path === "/v1/files/upload-sessions") {
        expect(persisted.get("file")?.id).toBe(options?.body?.id);
        return {
          id: options?.body?.id,
          state: complete ? "completed" : "uploading",
          partSize: FILE_CHUNK_BYTES,
          uploadedParts: [...uploaded],
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
      }
      if (path.endsWith("/parts")) {
        const number = Number(options?.body?.partNumber);
        signed.push(number);
        return {
          url: `https://storage.test/${number}`,
          sizeBytes: Math.min(
            FILE_CHUNK_BYTES,
            size - (number - 1) * FILE_CHUNK_BYTES
          ),
        };
      }
      if (path.endsWith("/complete")) {
        complete = true;
        return { state: "completed" };
      }
      return { state: "canceled" };
    }
  );
  const attachment = {
    id: "file",
    filename: "file.bin",
    mediaType: "application/octet-stream",
    state: 0,
  } satisfies AttachmentRecord;
  // A virtual blob ensures any whole-file allocation is a test failure, including at 5 GB.
  const blob = {
    size,
    arrayBuffer: () => {
      throw new Error("Whole-file buffer forbidden");
    },
    slice: (start: number, end: number) =>
      new Blob([new Uint8Array(Math.max(0, Math.min(size, end) - start))]),
  } as unknown as Blob;
  return {
    persisted,
    storage,
    uploaded,
    signed,
    post,
    params: {
      api: { post } as unknown as ApiClient,
      storage,
      workspaceId: "workspace",
      attachment,
      blob,
    },
  };
}

describe("chunked uploads", () => {
  it("limits concurrent parts to four and never buffers the whole file", async () => {
    const h = harness(FILE_CHUNK_BYTES * 5 + 3);
    let active = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: { body: Blob }) => {
        active++;
        peak = Math.max(peak, active);
        expect(options.body.size).toBeLessThanOrEqual(FILE_CHUNK_BYTES);
        await new Promise((resolve) => setTimeout(resolve, 1));
        h.uploaded.add(Number(url.split("/").pop()));
        active--;
        return new Response();
      })
    );
    expect(await uploadChunks(h.params)).toBe(true);
    expect(peak).toBe(4);
    expect(h.persisted.get("file")?.uploadedBytes).toBe(h.params.blob.size);
  });

  it("resumes provider-verified parts after a network interruption and restart", async () => {
    const h = harness(FILE_CHUNK_BYTES + 3);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/2")) {
          throw new TypeError("Offline");
        }
        h.uploaded.add(1);
        return new Response();
      })
    );
    await expect(uploadChunks(h.params)).rejects.toThrow("Offline");
    const id = h.persisted.get("file")?.id;
    h.signed.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response())
    );
    expect(await uploadChunks({ ...h.params })).toBe(true);
    expect(h.signed).toEqual([2]);
    expect(h.persisted.get("file")?.id).toBe(id);
  });

  it("keeps quota-rejected local data blocked without retrying until explicit retry", async () => {
    const h = harness(3);
    h.post.mockRejectedValueOnce(
      Object.assign(new Error("Maximum file size exceeded"), {
        statusCode: 413,
      })
    );
    expect(await uploadChunks(h.params)).toBe(false);
    expect(h.persisted.get("file")?.state).toBe("blocked");
    expect(await uploadChunks(h.params)).toBe(false);
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(h.storage.deleteTransfer).not.toHaveBeenCalled();
    h.persisted.set("file", {
      ...h.persisted.get("file")!,
      state: "uploading",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response())
    );
    expect(await uploadChunks(h.params)).toBe(true);
  });

  it("persists an offline attempt for retry and cannot complete when a part fails", async () => {
    const h = harness(3);
    h.post.mockRejectedValueOnce(
      Object.assign(new Error("Offline"), { statusCode: 0 })
    );
    await expect(uploadChunks(h.params)).rejects.toThrow("Offline");
    expect(h.persisted.get("file")?.state).toBe("uploading");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 }))
    );
    await expect(uploadChunks(h.params)).rejects.toThrow(
      "Storage part upload failed"
    );
    expect(h.post.mock.calls.some(([path]) => path.endsWith("/complete"))).toBe(
      false
    );
  });

  it("preserves state if IndexedDB is full before session creation", async () => {
    const h = harness(3);
    vi.spyOn(h.storage, "writeTransfer").mockRejectedValue(
      new DOMException("Disk full", "QuotaExceededError")
    );
    await expect(uploadChunks(h.params)).rejects.toThrow("Disk full");
    expect(h.post).not.toHaveBeenCalled();
  });
});
