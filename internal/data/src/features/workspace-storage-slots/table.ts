import { column, type RowType, Table } from "@powersync/common";
import type { CreateSchemaTableProps } from "../../core/utils";
import { localTable } from "../../core/utils";

export const WORKSPACE_STORAGE_SLOTS_TABLE = "workspace_storage_slots";
export const LOCAL_WORKSPACE_STORAGE_SLOTS_TABLE = localTable(
  WORKSPACE_STORAGE_SLOTS_TABLE,
);
export const WORKSPACE_STORAGE_VALUES_TABLE = "workspace_storage_values";
export const LOCAL_WORKSPACE_STORAGE_VALUES_TABLE = localTable(
  WORKSPACE_STORAGE_VALUES_TABLE,
);

export const createWorkspaceStorageSlotsTable = ({
  localOnly,
  viewName = WORKSPACE_STORAGE_SLOTS_TABLE,
}: CreateSchemaTableProps = {}) =>
  new Table(
    {
      workspace_id: column.text,
      resource_id: column.text,
      plugin_id: column.text,
      name: column.text,
      kind: column.text,
      backing_id: column.text,
      metadata: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      localOnly,
      viewName,
      indexes: {
        pss_workspace_plugin_idx: ["workspace_id", "plugin_id"],
        pss_resource_idx: ["resource_id"],
      },
    },
  );

export const createWorkspaceStorageValuesTable = ({
  localOnly,
  viewName = WORKSPACE_STORAGE_VALUES_TABLE,
}: CreateSchemaTableProps = {}) =>
  new Table(
    {
      storage_id: column.text,
      workspace_id: column.text,
      key: column.text,
      value: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      localOnly,
      viewName,
      indexes: {
        psv_storage_key_idx: ["storage_id", "key"],
      },
    },
  );

export type WorkspaceStorageSlotEntity = RowType<
  ReturnType<typeof createWorkspaceStorageSlotsTable>
>;
export type WorkspaceStorageValueEntity = RowType<
  ReturnType<typeof createWorkspaceStorageValuesTable>
>;
