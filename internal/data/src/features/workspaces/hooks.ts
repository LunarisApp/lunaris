import { useSyncStream } from "@powersync/react";
import {
  WORKSPACE_VISIBILITY,
  type WorkspaceVisibility,
} from "@repo/auth/sync-access";

// Keep recently opened workspace content through a week away from the app.
const WORKSPACE_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export type WorkspaceSyncStreamSnapshot = {
  workspace_content: {
    hasSynced: boolean;
    isLoading: boolean;
  };
};

export function useWorkspaceSync(
  workspaceId: string | undefined,
  visibility: WorkspaceVisibility = WORKSPACE_VISIBILITY.shared
) {
  const isLocal = visibility === WORKSPACE_VISIBILITY.local;
  const params = !isLocal && workspaceId ? { workspace_id: workspaceId } : null;

  const workspaceContent = useSyncStream({
    name: "workspace_content",
    ttl: WORKSPACE_RETENTION_SECONDS,
    parameters: params,
  });

  const streams: WorkspaceSyncStreamSnapshot = {
    workspace_content: {
      hasSynced: workspaceContent?.subscription.hasSynced === true,
      isLoading: !workspaceContent,
    },
  };

  if (isLocal) {
    const localStreams: WorkspaceSyncStreamSnapshot = {
      workspace_content: { hasSynced: true, isLoading: false },
    };

    return {
      hasSynced: true,
      isLoading: false,
      streams: localStreams,
    };
  }

  return {
    hasSynced: workspaceContent?.subscription.hasSynced === true,
    isLoading: !workspaceContent,
    streams,
  };
}
