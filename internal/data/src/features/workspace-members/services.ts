import { useQuery } from "@powersync/react";
import { WORKSPACE_ROLE, type WorkspaceRole } from "@repo/auth/sync-access";
import { MEMBERS_TABLE } from "../organizations/table";
import { WORKSPACE_MEMBERS_TABLE } from "./table";

interface WorkspaceRoleRow {
  role: string;
}

export function useWorkspaceMemberRole(
  workspaceId: string | undefined,
  userId: string | undefined,
) {
  const query = useQuery<WorkspaceRoleRow>(
    `SELECT workspace_members.role
     FROM ${WORKSPACE_MEMBERS_TABLE} workspace_members
     INNER JOIN ${MEMBERS_TABLE} member
       ON member.id = workspace_members.organization_member_id
     WHERE workspace_members.workspace_id = ? AND member.user_id = ?
     LIMIT 1`,
    [workspaceId ?? "", userId ?? ""],
  );
  const role = query.data?.[0]?.role;
  return {
    ...query,
    data:
      role === WORKSPACE_ROLE.editor || role === WORKSPACE_ROLE.viewer
        ? (role as WorkspaceRole)
        : undefined,
  };
}
