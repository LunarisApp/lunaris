import { column, type RowType, Table } from "@powersync/common";
import type { CreateSchemaTableProps } from "../../core/utils";

export const PREFERENCES_TABLE = "preferences";
export const createPreferenceTable = ({
  localOnly,
}: CreateSchemaTableProps = {}) =>
  new Table(
    {
      plugin_id: column.text,
      key: column.text,
      value: column.text,
    },
    {
      viewName: PREFERENCES_TABLE,
      localOnly,
      indexes: {
        plugin_idx: ["plugin_id"],
        plugin_key_idx: ["plugin_id", "key"],
      },
    }
  );
export type PreferenceEntity = RowType<
  ReturnType<typeof createPreferenceTable>
>;
