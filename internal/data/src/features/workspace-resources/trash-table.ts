import { column, type RowType, Table } from "@powersync/common";
import type { CreateSchemaTableProps } from "../../core/utils";
import { localTable } from "../../core/utils";

export const WORKSPACE_RESOURCE_TRASH_TABLE = "workspace_resource_trash";
export const LOCAL_WORKSPACE_RESOURCE_TRASH_TABLE = localTable(
  WORKSPACE_RESOURCE_TRASH_TABLE
);

export const createWorkspaceResourceTrashTable = ({
  localOnly,
  viewName = WORKSPACE_RESOURCE_TRASH_TABLE,
}: CreateSchemaTableProps = {}) =>
  new Table(
    {
      workspace_id: column.text,
      trash_root_id: column.text,
      trashed_at: column.text,
      purge_at: column.text,
    },
    {
      localOnly,
      viewName,
      indexes: {
        workspace_resource_trash_workspace_purge_idx: [
          "workspace_id",
          "purge_at",
        ],
        workspace_resource_trash_workspace_root_idx: [
          "workspace_id",
          "trash_root_id",
        ],
      },
    }
  );

export type WorkspaceResourceTrashEntity = RowType<
  ReturnType<typeof createWorkspaceResourceTrashTable>
>;
