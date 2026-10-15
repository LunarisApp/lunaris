import { normalizeWorkspaceVisibility } from "@repo/auth/sync-access";
import {
  type WorkspaceEntity,
  useWorkspaceSync,
} from "@repo/data/features/workspaces";

export default function WorkspacePreloader({
  enabled,
  workspace,
}: {
  enabled: boolean;
  workspace: WorkspaceEntity;
}) {
  useWorkspaceSync(
    enabled ? workspace.id : undefined,
    normalizeWorkspaceVisibility(workspace.visibility),
  );

  return null;
}
