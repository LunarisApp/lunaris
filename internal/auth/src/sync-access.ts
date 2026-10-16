export const SYNC_ACCESS = {
  cloud: "cloud",
  localOnly: "local-only",
} as const;

export type SyncAccessPolicy = (typeof SYNC_ACCESS)[keyof typeof SYNC_ACCESS];

export const WORKSPACE_VISIBILITY = {
  shared: "shared",
  private: "private",
  local: "local",
} as const;

export type WorkspaceVisibility =
  (typeof WORKSPACE_VISIBILITY)[keyof typeof WORKSPACE_VISIBILITY];

export const WORKSPACE_ROLE = {
  editor: "editor",
  viewer: "viewer",
} as const;

export type WorkspaceRole =
  (typeof WORKSPACE_ROLE)[keyof typeof WORKSPACE_ROLE];

export function normalizeWorkspaceVisibility(
  value: unknown
): WorkspaceVisibility | undefined {
  switch (value) {
    case WORKSPACE_VISIBILITY.local:
    case WORKSPACE_VISIBILITY.private:
    case WORKSPACE_VISIBILITY.shared:
      return value;
    default:
      return undefined;
  }
}

export function resolveSyncAccess(params: {
  isAnonymous: boolean;
}): SyncAccessPolicy {
  return params.isAnonymous ? SYNC_ACCESS.localOnly : SYNC_ACCESS.cloud;
}
