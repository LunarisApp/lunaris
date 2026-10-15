import { column, type RowType, Table } from "@powersync/common";
import type { CreateSchemaTableProps } from "../../core/utils";
import { localTable } from "../../core/utils";

export const WORKSPACE_RESOURCES_TABLE = "workspace_resources";
export const LOCAL_WORKSPACE_RESOURCES_TABLE = localTable(WORKSPACE_RESOURCES_TABLE);

export const createWorkspaceResourcesTable = ({
  localOnly,
  viewName = WORKSPACE_RESOURCES_TABLE,
}: CreateSchemaTableProps = {}) =>
  new Table(
    {
      workspace_id: column.text,
      name: column.text,
      icon: column.text,
      position: column.integer,
      parent_id: column.text,
      resource_type_id: column.text,
      schema_version: column.integer,
      created_at: column.text,
      updated_at: column.text,
      last_activity_at: column.text,
    },
    {
      localOnly,
      viewName,
      indexes: {
        workspace_resources_workspace_parent_idx: ["workspace_id", "parent_id"],
      },
    }
  );

export type WorkspaceResourceEntity = RowType<
  ReturnType<typeof createWorkspaceResourcesTable>
>;
