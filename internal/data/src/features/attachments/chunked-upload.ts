import type { AttachmentRecord } from "@powersync/common";
import type { ApiClient } from "../../http";
import {
  FILE_CHUNK_BYTES,
  type IndexedDbFileStorageAdapter,
} from "../../storage/indexeddb-file-storage";

export interface FileTransferState {
  error?: string;
  id: string;
  state: "uploading" | "blocked" | "completed";
  totalBytes: number;
  uploadedBytes: number;
}
interface UploadSession {
  expiresAt: string;
  id: string;
  partSize: number;
  state: string;
  uploadedParts: number[];
}
export const TRANSFER_EVENT = "lunaris-file-transfer";
export const CAPACITY_EVENT = "lunaris-storage-capacity-changed";

export function errorStatus(error: unknown) {
  if (error && typeof error === "object" && "statusCode" in error) {
    return Number(error.statusCode);
  }
  if (error && typeof error === "object" && "status" in error) {
    return Number(error.status);
  }
}

export async function uploadChunks(params: {
  api: ApiClient;
  storage: IndexedDbFileStorageAdapter;
  workspaceId: string;
  attachment: AttachmentRecord;
  blob: Blob;
  signal?: AbortSignal;
}) {
  const { api, storage, workspaceId, attachment, blob, signal } = params;
  let state = await storage.readTransfer<FileTransferState>(attachment.id);
  if (state?.state === "blocked") {
    return false;
  }
  if (state?.state === "completed") {
    return true;
  }
  state ??= {
    id: crypto.randomUUID(),
    state: "uploading",
    uploadedBytes: 0,
    totalBytes: blob.size,
  };
  const persist = async () => {
    await storage.writeTransfer(attachment.id, state);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(TRANSFER_EVENT, {
          detail: { workspaceId, fileId: attachment.id, ...state },
        })
      );
    }
  };
  await persist(); // Persist idempotency key before making any network request.
  const metadata = attachment.metaData
    ? (JSON.parse(attachment.metaData) as {
        replacementFileId?: string;
        replacementStorageId?: string;
      })
    : {};
  try {
    let session: UploadSession;
    try {
      session = await api.post<UploadSession>("/v1/files/upload-sessions", {
        body: {
          id: state.id,
          fileId: attachment.id,
          workspaceId,
          sizeBytes: blob.size,
          mediaType: attachment.mediaType ?? "application/octet-stream",
          replacementFileId: metadata.replacementFileId,
          replacementStorageId: metadata.replacementStorageId,
        },
        signal,
      });
    } catch (error) {
      if (errorStatus(error) === 410) {
        // Server retains old reservation until abort succeeds. New attempt has a new immutable key.
        await api.post(`/v1/files/upload-sessions/${state.id}/cancel`, {
          signal,
        });
        await storage.deleteTransfer(attachment.id);
      }
      throw error;
    }
    if (session.state !== "completed" && session.state !== "completing") {
      if (session.partSize !== FILE_CHUNK_BYTES) {
        throw new Error("Unsupported upload part size");
      }
      const completed = new Set(session.uploadedParts);
      const count = Math.max(1, Math.ceil(blob.size / FILE_CHUNK_BYTES));
      const uploadedBytes = () =>
        [...completed].reduce(
          (sum, number) =>
            sum +
            Math.min(
              FILE_CHUNK_BYTES,
              Math.max(0, blob.size - (number - 1) * FILE_CHUNK_BYTES)
            ),
          0
        );
      state.uploadedBytes = uploadedBytes();
      await persist();
      let nextPart = 1;
      const worker = async () => {
        while (nextPart <= count) {
          signal?.throwIfAborted();
          const number = nextPart++;
          if (completed.has(number)) {
            continue;
          }
          const part = blob.slice(
            (number - 1) * FILE_CHUNK_BYTES,
            number * FILE_CHUNK_BYTES
          );
          const signed = await api.post<{ url: string; sizeBytes: number }>(
            `/v1/files/upload-sessions/${state.id}/parts`,
            {
              body: { partNumber: number },
              signal,
            }
          );
          if (signed.sizeBytes !== part.size) {
            throw new Error("Upload part length changed");
          }
          // Browser supplies Content-Length from Blob size; it is bound in the signature.
          const response = await fetch(signed.url, {
            method: "PUT",
            body: part,
            signal,
          });
          if (!response.ok) {
            throw Object.assign(new Error("Storage part upload failed"), {
              status: response.status,
            });
          }
          completed.add(number);
          state.uploadedBytes = uploadedBytes();
          await persist();
        }
      };
      const results = await Promise.allSettled(
        Array.from({ length: Math.min(4, count) }, worker)
      );
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") {
        throw failed.reason;
      }
    }
    if (session.state !== "completed") {
      await api.post(`/v1/files/upload-sessions/${state.id}/complete`, {
        signal,
      });
    }
    state.state = "completed";
    state.uploadedBytes = blob.size;
    await persist();
    return true;
  } catch (error) {
    if (errorStatus(error) === 413) {
      state.state = "blocked";
      state.error =
        error instanceof Error
          ? error.message
          : "Organization storage limit reached";
      await persist();
      return false;
    }
    throw error;
  }
}
