import { column, type RowType, Table } from "@powersync/common";
import type { CreateSchemaTableProps } from "../../core/utils";
import { localTable } from "../../core/utils";

export const YJS_DOCUMENTS_TABLE = "yjs_documents";
export const LOCAL_YJS_DOCUMENTS_TABLE = localTable(YJS_DOCUMENTS_TABLE);
export const createYjsDocumentTable = ({
  localOnly,
  viewName = YJS_DOCUMENTS_TABLE,
}: CreateSchemaTableProps = {}) =>
  new Table(
    {
      workspace_id: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      viewName,
      localOnly,
      indexes: {
        workspace_id_idx: ["workspace_id"],
      },
    }
  );
export type YjsDocumentEntity = RowType<
  ReturnType<typeof createYjsDocumentTable>
>;

export const YJS_DOCUMENT_UPDATES_TABLE = "yjs_document_updates";
export const LOCAL_YJS_DOCUMENT_UPDATES_TABLE = localTable(
  YJS_DOCUMENT_UPDATES_TABLE
);
export const createYjsDocumentUpdateTable = ({
  localOnly,
  viewName = YJS_DOCUMENT_UPDATES_TABLE,
}: CreateSchemaTableProps = {}) =>
  new Table(
    {
      workspace_id: column.text,
      document_id: column.text,
      user_id: column.text,
      update_b64: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      viewName,
      localOnly,
      indexes: {
        document_id_idx: ["document_id"],
      },
    }
  );
export type YjsDocumentUpdateEntity = RowType<
  ReturnType<typeof createYjsDocumentUpdateTable>
>;
