import { column, type RowType, Table } from "@powersync/common";

export const WORKSPACE_MEMBERS_TABLE = "workspace_members";

export const createWorkspaceMemberTable = () =>
  new Table(
    {
      workspace_id: column.text,
      organization_member_id: column.text,
      role: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        workspace_members_workspace_idx: ["workspace_id"],
        workspace_members_organization_member_idx: ["organization_member_id"],
      },
    },
  );

export type WorkspaceMemberEntity = RowType<
  ReturnType<typeof createWorkspaceMemberTable>
>;
