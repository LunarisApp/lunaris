import { column, type RowType, Table } from "@powersync/common";
import type { CreateSchemaTableProps } from "../../core/utils";
import { localTable } from "../../core/utils";

export const WORKSPACES_TABLE = "workspaces";
export const LOCAL_WORKSPACES_TABLE = localTable(WORKSPACES_TABLE);
export const createWorkspaceTable = ({
  localOnly,
  viewName = WORKSPACES_TABLE,
}: CreateSchemaTableProps = {}) =>
  new Table(
    {
      name: column.text,
      slug: column.text,
      organization_id: column.text,
      owner_id: column.text,
      visibility: column.text,
      created_at: column.text,
      updated_at: column.text,
      last_activity_at: column.text,
    },
    {
      localOnly,
      viewName,
    }
  );
export type WorkspaceEntity = RowType<ReturnType<typeof createWorkspaceTable>>;
