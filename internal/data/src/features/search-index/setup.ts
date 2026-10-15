import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { ensureTx } from "../../core/utils";

export const SEARCH_INDEX_ENTRIES_TABLE = "search_index_entries";
export const SEARCH_INDEX_FTS_TABLE = "search_index_fts";
const SEARCH_INDEX_METADATA_TABLE = "search_index_metadata";
const SEARCH_INDEX_SCHEMA_VERSION = "2";

const TRIGGERS = [
  "search_index_entries_ai",
  "search_index_entries_au",
  "search_index_entries_ad",
] as const;

/** Creates host-owned local FTS storage after PowerSync initializes SQLite. */
export async function configureSearchIndex(
  db: AbstractPowerSyncDatabase,
): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${SEARCH_INDEX_METADATA_TABLE} (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )
  `);

  const stored = await db.getOptional<{ value: string }>(
    `SELECT value FROM ${SEARCH_INDEX_METADATA_TABLE} WHERE key = ?`,
    ["schema_version"],
  );
  const existingObjects = await db.getAll<{ name: string; type: string }>(
    `SELECT name, type FROM sqlite_master
     WHERE (type = 'table' AND name IN (?, ?))
       OR (type = 'trigger' AND name IN (?, ?, ?))`,
    [SEARCH_INDEX_ENTRIES_TABLE, SEARCH_INDEX_FTS_TABLE, ...TRIGGERS],
  );
  const existingNames = new Set(existingObjects.map(({ name }) => name));
  const resetEntries = stored?.value !== SEARCH_INDEX_SCHEMA_VERSION;
  const rebuild =
    resetEntries ||
    !existingNames.has(SEARCH_INDEX_ENTRIES_TABLE) ||
    !existingNames.has(SEARCH_INDEX_FTS_TABLE) ||
    TRIGGERS.some((trigger) => !existingNames.has(trigger));

  await ensureTx(db, async (tx) => {
    if (rebuild) {
      for (const trigger of TRIGGERS) {
        await tx.execute(`DROP TRIGGER IF EXISTS ${trigger}`);
      }
      await tx.execute(`DROP TABLE IF EXISTS ${SEARCH_INDEX_FTS_TABLE}`);
      if (resetEntries) {
        await tx.execute(`DROP TABLE IF EXISTS ${SEARCH_INDEX_ENTRIES_TABLE}`);
      }
    }
    await tx.execute(`
      CREATE TABLE IF NOT EXISTS ${SEARCH_INDEX_ENTRIES_TABLE} (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_key TEXT UNIQUE NOT NULL,
        organization_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        resource_type_id TEXT NOT NULL,
        indexer_id TEXT NOT NULL,
        source_revision TEXT NOT NULL,
        content TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      )
    `);
    await tx.execute(
      `CREATE INDEX IF NOT EXISTS search_index_entries_organization_resource
       ON ${SEARCH_INDEX_ENTRIES_TABLE}(organization_id, resource_id)`,
    );
    await tx.execute(
      `CREATE INDEX IF NOT EXISTS search_index_entries_indexer
       ON ${SEARCH_INDEX_ENTRIES_TABLE}(organization_id, indexer_id)`,
    );

    await tx.execute(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_INDEX_FTS_TABLE}
      USING fts5(
        content,
        content='${SEARCH_INDEX_ENTRIES_TABLE}',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      )
    `);
    await tx.execute(`
      CREATE TRIGGER IF NOT EXISTS search_index_entries_ai
      AFTER INSERT ON ${SEARCH_INDEX_ENTRIES_TABLE} BEGIN
        INSERT INTO ${SEARCH_INDEX_FTS_TABLE}(rowid, content)
        VALUES (new.rowid, new.content);
      END
    `);
    await tx.execute(`
      CREATE TRIGGER IF NOT EXISTS search_index_entries_ad
      AFTER DELETE ON ${SEARCH_INDEX_ENTRIES_TABLE} BEGIN
        INSERT INTO ${SEARCH_INDEX_FTS_TABLE}(${SEARCH_INDEX_FTS_TABLE}, rowid, content)
        VALUES ('delete', old.rowid, old.content);
      END
    `);
    await tx.execute(`
      CREATE TRIGGER IF NOT EXISTS search_index_entries_au
      AFTER UPDATE ON ${SEARCH_INDEX_ENTRIES_TABLE} BEGIN
        INSERT INTO ${SEARCH_INDEX_FTS_TABLE}(${SEARCH_INDEX_FTS_TABLE}, rowid, content)
        VALUES ('delete', old.rowid, old.content);
        INSERT INTO ${SEARCH_INDEX_FTS_TABLE}(rowid, content)
        VALUES (new.rowid, new.content);
      END
    `);

    if (rebuild) {
      await tx.execute(
        `INSERT INTO ${SEARCH_INDEX_FTS_TABLE}(${SEARCH_INDEX_FTS_TABLE}) VALUES ('rebuild')`,
      );
      await tx.execute(
        `INSERT INTO ${SEARCH_INDEX_METADATA_TABLE}(key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ["schema_version", SEARCH_INDEX_SCHEMA_VERSION],
      );
    }
  });
}
