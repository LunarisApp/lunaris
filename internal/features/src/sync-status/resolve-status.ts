import type { SyncAccessPolicy } from "@repo/data/core";

export type SyncStatusDescriptor =
  | { kind: "online"; lastSyncedAt: Date | undefined }
  | { kind: "connecting"; lastSyncedAt: Date | undefined }
  | { kind: "offline"; lastSyncedAt: Date | undefined }
  | { kind: "local-only-anonymous"; lastSyncedAt: Date | undefined }
  | { kind: "blocked-auth"; lastSyncedAt: Date | undefined }
  | { kind: "blocked-permission"; lastSyncedAt: Date | undefined }
  | { kind: "blocked-generic"; lastSyncedAt: Date | undefined }
  | {
      kind: "transient-error";
      reason: string | undefined;
      lastSyncedAt: Date | undefined;
    };

export interface ResolveSyncStatusInput {
  blocked: boolean;
  connected: boolean;
  connecting: boolean;
  downloadError: Error | undefined;
  lastClientErrorStatus: number | null;
  lastSyncedAt: Date | undefined;
  networkOnline: boolean;
  syncAccess: SyncAccessPolicy;
  uploadError: Error | undefined;
}

/**
 * Maps the cross-cutting sync state into a single descriptor the UI can render.
 *
 * Priority order (first match wins) is intentional: a local-only policy means
 * cloud sync is unreachable for this account regardless of network, so it must
 * outrank connectivity-derived states. Blocked states outrank transient errors
 * because the client has stopped retrying. Browser connectivity then outranks
 * stale sync transport state. The fall-through `offline` is the "we are not
 * connected and we don't know why" bucket.
 */
export function resolveSyncStatus(
  input: ResolveSyncStatusInput
): SyncStatusDescriptor {
  if (input.syncAccess === "local-only") {
    return { kind: "local-only-anonymous", lastSyncedAt: input.lastSyncedAt };
  }

  if (input.blocked) {
    if (input.lastClientErrorStatus === 401) {
      return { kind: "blocked-auth", lastSyncedAt: input.lastSyncedAt };
    }
    if (input.lastClientErrorStatus === 403) {
      return { kind: "blocked-permission", lastSyncedAt: input.lastSyncedAt };
    }
    return { kind: "blocked-generic", lastSyncedAt: input.lastSyncedAt };
  }

  if (!input.networkOnline) {
    return { kind: "offline", lastSyncedAt: input.lastSyncedAt };
  }

  const error = input.uploadError ?? input.downloadError;
  if (error && input.connected) {
    return {
      kind: "transient-error",
      reason: error.message?.trim() || undefined,
      lastSyncedAt: input.lastSyncedAt,
    };
  }

  if (input.connected) {
    return { kind: "online", lastSyncedAt: input.lastSyncedAt };
  }

  if (input.connecting) {
    return { kind: "connecting", lastSyncedAt: input.lastSyncedAt };
  }

  return { kind: "offline", lastSyncedAt: input.lastSyncedAt };
}
