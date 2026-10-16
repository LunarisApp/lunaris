import { column, type RowType, Table } from "@powersync/common";
import type { CreateSchemaTableProps } from "../../core/utils";
import { localTable } from "../../core/utils";

export const WORKSPACE_EXTENSIONS_TABLE = "workspace_extensions";
export const LOCAL_WORKSPACE_EXTENSIONS_TABLE = localTable(
  WORKSPACE_EXTENSIONS_TABLE
);

export const createWorkspaceExtensionsTable = ({
  localOnly,
  viewName = WORKSPACE_EXTENSIONS_TABLE,
}: CreateSchemaTableProps = {}) =>
  new Table(
    {
      workspace_id: column.text,
      extension_id: column.text,
      enabled: column.integer,
      registry_id: column.text,
      version: column.text,
      descriptor_url: column.text,
      descriptor_bytes: column.integer,
      descriptor_sha256: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      localOnly,
      viewName,
      indexes: {
        workspace_extensions_workspace_idx: ["workspace_id"],
        workspace_extensions_workspace_extension_idx: [
          "workspace_id",
          "extension_id",
        ],
      },
    }
  );

export type WorkspaceExtensionEntity = RowType<
  ReturnType<typeof createWorkspaceExtensionsTable>
>;
