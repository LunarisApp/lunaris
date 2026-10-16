// @vitest-environment node
import { DatabaseSync as Database } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { DatabaseOrTx } from "../../core/utils";
import {
  moveWorkspaceResource,
  deleteWorkspaceResource,
} from "../workspace-resources/services";
import { deleteResourceStorage } from "../workspace-storage-slots/services";
import { latestTimestamp } from "./time";
import { recordActivity } from "./services";

const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) {
    db.close();
  }
});
function fixture(prefix = "") {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  for (const scope of ["", "local_"]) {
    sqlite.exec(`
      CREATE TABLE ${scope}workspaces(id TEXT PRIMARY KEY, created_at TEXT, updated_at TEXT, last_activity_at TEXT);
      CREATE TABLE ${scope}workspace_resources(id TEXT PRIMARY KEY, workspace_id TEXT, parent_id TEXT, created_at TEXT, updated_at TEXT, last_activity_at TEXT);
      CREATE TABLE ${scope}workspace_storage_slots(id TEXT PRIMARY KEY, workspace_id TEXT, resource_id TEXT, kind TEXT, backing_id TEXT);
      CREATE TABLE ${scope}yjs_documents(id TEXT PRIMARY KEY, workspace_id TEXT, updated_at TEXT);
      CREATE TABLE ${scope}yjs_document_updates(id TEXT PRIMARY KEY, workspace_id TEXT, document_id TEXT, updated_at TEXT);
      CREATE TABLE ${scope}workspace_storage_values(id TEXT PRIMARY KEY, workspace_id TEXT, storage_id TEXT, updated_at TEXT);
      CREATE TABLE ${scope}workspace_resource_trash(id TEXT PRIMARY KEY, workspace_id TEXT, trashed_at TEXT);
      CREATE TABLE ${scope}workspace_extensions(id TEXT PRIMARY KEY, workspace_id TEXT, updated_at TEXT);
    `);
  }
  sqlite.exec(`
    INSERT INTO ${prefix}workspaces VALUES ('w', '2026-01-01', '2026-01-01', NULL), ('other', '2026-01-01', '2026-01-01', NULL);
    INSERT INTO ${prefix}workspace_resources VALUES
      ('folder', 'w', NULL, '2026-01-01', '2026-01-01', NULL),
      ('board', 'w', 'folder', '2026-01-01', '2026-01-01', NULL),
      ('task', 'w', 'board', '2026-01-01', '2026-01-01', NULL),
      ('other', 'other', NULL, '2026-01-01', '2026-01-01', NULL);
    INSERT INTO ${prefix}workspace_storage_slots VALUES ('s', 'w', 'task', 'yjs', 'd');
    INSERT INTO ${prefix}yjs_documents VALUES ('d', 'w', '2026-01-01');
  `);
  for (const scope of ["", "local_"]) {
    sqlite.exec(`ALTER TABLE ${scope}workspace_resources ADD COLUMN position INTEGER;
      ALTER TABLE ${scope}workspace_storage_slots ADD COLUMN updated_at TEXT;
      ALTER TABLE ${scope}workspace_storage_slots ADD COLUMN name TEXT;`);
  }
  const tx = {
    execute: async (sql: string, params: string[] = []) =>
      sqlite.prepare(sql).run(...params),
    getAll: async (sql: string, params: string[] = []) =>
      sqlite.prepare(sql).all(...params),
  };
  const db = {
    ...tx,
    writeTransaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>
    ) => {
      sqlite.exec("BEGIN");
      try {
        const result = await callback(tx);
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as DatabaseOrTx;
  const activity = (table: string, id: string) =>
    sqlite
      .prepare(
        `SELECT updated_at, last_activity_at FROM ${prefix}${table} WHERE id = ?`
      )
      .get(id);
  return { sqlite, db, activity };
}

describe("activity propagation in SQLite", () => {
  it.each(["", "local_"])(
    "propagates persisted content through ancestry (%s)",
    async (prefix) => {
      const { db, activity } = fixture(prefix);
      const at = "2026-02-01T12:00:00.000Z";
      await recordActivity(db, { documentId: "d" }, at);
      for (const id of ["task", "board", "folder"]) {
        expect(activity("workspace_resources", id)).toEqual({
          updated_at: "2026-01-01",
          last_activity_at: at,
        });
      }
      expect(activity("workspaces", "w")).toEqual({
        updated_at: "2026-01-01",
        last_activity_at: at,
      });
      expect(activity("workspaces", "other")).toEqual({
        updated_at: "2026-01-01",
        last_activity_at: null,
      });
    }
  );
  it("does not regress on older updates or differing timestamp formats", async () => {
    const { db, activity } = fixture();
    await recordActivity(db, { resourceId: "task" }, "2026-02-01 15:00:00");
    await recordActivity(
      db,
      { resourceId: "task" },
      "2026-02-01T12:00:00.000Z"
    );
    expect(activity("workspace_resources", "board")).toEqual({
      updated_at: "2026-01-01",
      last_activity_at: "2026-02-01 15:00:00",
    });
  });
  it("terminates cycles and never crosses workspaces", async () => {
    const { db, sqlite, activity } = fixture();
    sqlite.exec(
      "UPDATE workspace_resources SET parent_id = 'board' WHERE id = 'folder'"
    );
    await recordActivity(db, { resourceId: "task" }, "2026-02-01");
    sqlite.exec(
      "UPDATE workspace_resources SET parent_id = 'other' WHERE id = 'folder'"
    );
    await recordActivity(db, { resourceId: "task" }, "2026-03-01");
    expect(activity("workspace_resources", "other")).toEqual({
      updated_at: "2026-01-01",
      last_activity_at: null,
    });
  });
  it("records moves in both old and new ancestry, and retains deletion activity", async () => {
    const { db, sqlite, activity } = fixture();
    await moveWorkspaceResource({
      db,
      id: "task",
      newParentId: "folder",
      newPosition: 0,
    });
    const at = (
      activity("workspace_resources", "board") as { last_activity_at: string }
    ).last_activity_at;
    expect(at).toBeTruthy();
    expect(activity("workspace_resources", "folder")).toEqual({
      updated_at: "2026-01-01",
      last_activity_at: at,
    });
    await deleteWorkspaceResource({ db, id: "task" });
    expect(
      sqlite
        .prepare("SELECT id FROM workspace_resources WHERE id = 'task'")
        .get()
    ).toBeUndefined();
    expect(
      (activity("workspaces", "w") as { last_activity_at: string })
        .last_activity_at >= at
    ).toBe(true);
  });
  it("rolls back activity when a mutation fails", async () => {
    const { db, sqlite, activity } = fixture();
    sqlite.exec(
      "CREATE TRIGGER reject_move BEFORE UPDATE OF parent_id ON workspace_resources BEGIN SELECT RAISE(ABORT, 'move rejected'); END"
    );
    await expect(
      moveWorkspaceResource({
        db,
        id: "task",
        newParentId: "folder",
        newPosition: 0,
      })
    ).rejects.toThrow("move rejected");
    expect(activity("workspace_resources", "board")).toEqual({
      updated_at: "2026-01-01",
      last_activity_at: null,
    });
  });
  it("rolls back activity and content when storage deletion fails", async () => {
    const { db, sqlite, activity } = fixture();
    sqlite.exec(
      "INSERT INTO workspace_storage_values VALUES ('value', 'w', 's', '2026-02-01'); CREATE TRIGGER reject_storage_delete BEFORE DELETE ON workspace_storage_slots BEGIN SELECT RAISE(ABORT, 'delete rejected'); END"
    );
    await expect(deleteResourceStorage(db, "task")).rejects.toThrow(
      "delete rejected"
    );
    expect(activity("workspace_resources", "board")).toEqual({
      updated_at: "2026-01-01",
      last_activity_at: null,
    });
    expect(
      sqlite
        .prepare("SELECT id FROM workspace_storage_values WHERE id = 'value'")
        .get()
    ).toEqual({ id: "value" });
  });

  it("compares UTC instants and skips invalid dates for display", () => {
    expect(
      latestTimestamp(
        "bad",
        null,
        "2026-01-01 13:00:00",
        "2026-01-01T12:00:00Z"
      )?.toISOString()
    ).toBe("2026-01-01T13:00:00.000Z");
    expect(latestTimestamp(null, "bad")).toBeNull();
  });
});
