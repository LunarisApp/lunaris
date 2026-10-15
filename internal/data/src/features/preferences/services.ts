import {
  type AdditionalOptions,
  useQuery,
  useSuspenseQuery,
} from "@powersync/react";
import { type DatabaseOrTx, ensureTx } from "../../core/utils";
import { createId } from "@repo/utils";
import { PREFERENCES_TABLE, type PreferenceEntity } from "./table";

function buildQuery(pluginId: string, key?: string) {
  const baseQuery = `SELECT * FROM ${PREFERENCES_TABLE} WHERE plugin_id = ?`;
  if (key) {
    return {
      query: `${baseQuery} AND key = ?`,
      params: [pluginId, key],
    };
  }
  return { query: baseQuery, params: [pluginId] };
}

export function usePreferencesQuery(params: {
  pluginId: string;
  key?: string;
  options?: AdditionalOptions;
}) {
  const { pluginId, key, options } = params;
  const { query, params: queryParams } = buildQuery(pluginId, key);
  return useQuery<PreferenceEntity>(query, queryParams, options);
}

export function usePreferencesSuspenseQuery(params: {
  pluginId: string;
  key?: string;
  options?: AdditionalOptions;
}) {
  const { pluginId, key, options } = params;
  const { query, params: queryParams } = buildQuery(pluginId, key);
  return useSuspenseQuery<PreferenceEntity>(query, queryParams, options);
}

export function getPreference(params: {
  db: DatabaseOrTx;
  pluginId: string;
  key?: string;
}) {
  const { db, pluginId, key } = params;
  return db.getOptional<PreferenceEntity>(
    `SELECT * FROM ${PREFERENCES_TABLE} WHERE plugin_id = ? AND key = ?`,
    [pluginId, key]
  );
}

export function getAllPreferences(params: {
  db: DatabaseOrTx;
  pluginId: string;
}) {
  const { db, pluginId } = params;
  return db.getAll<PreferenceEntity>(
    `SELECT * FROM ${PREFERENCES_TABLE} WHERE plugin_id = ?`,
    [pluginId]
  );
}

export function setPreference(params: {
  db: DatabaseOrTx;
  pluginId: string;
  key: string;
  value: string;
}) {
  const { db, pluginId, key, value } = params;
  return ensureTx(db, async (tx) => {
    const existing = await tx.getOptional<boolean>(
      `SELECT 1
         FROM ${PREFERENCES_TABLE}
         WHERE plugin_id = ? AND key = ?`,
      [pluginId, key]
    );

    const result = await (existing
      ? tx.execute(
          `UPDATE ${PREFERENCES_TABLE} SET value = ? WHERE plugin_id = ? AND key = ?`,
          [value, pluginId, key]
        )
      : tx.execute(
          `INSERT INTO ${PREFERENCES_TABLE} (id, plugin_id, key, value) VALUES (?, ?, ?, ?)`,
          [createId("pref"), pluginId, key, value]
        ));
    return result;
  });
}

export function removePreference(params: {
  db: DatabaseOrTx;
  pluginId: string;
  key: string;
}) {
  const { db, pluginId, key } = params;
  return db.execute(
    `DELETE FROM ${PREFERENCES_TABLE} WHERE plugin_id = ? AND key = ?`,
    [pluginId, key]
  );
}

export function createPreferencesService(db: DatabaseOrTx, pluginId: string) {
  const get = (key?: string) =>
    getPreference({
      db,
      pluginId,
      key,
    });
  const getAll = () => getAllPreferences({ db, pluginId });
  const set = (key: string, value: string) =>
    setPreference({
      db,
      pluginId,
      key,
      value,
    });
  const remove = (key: string) => removePreference({ db, pluginId, key });
  return { get, getAll, set, remove };
}
