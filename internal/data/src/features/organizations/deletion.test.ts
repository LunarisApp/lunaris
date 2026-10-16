// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Database } from "../../core/utils";
import { discardOrganizationUploads } from "./deletion";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    "CREATE TABLE workspaces(id TEXT, organization_id TEXT); CREATE TABLE ps_crud(id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT);"
  );
  const tables = [
    "yjs_document_updates",
    "yjs_documents",
    "workspace_storage_values",
    "workspace_storage_slots",
    "workspace_resource_trash",
    "workspace_resources",
    "workspace_extensions",
    "workspace_members",
  ];
  for (const table of tables) {
    sqlite.exec(`CREATE TABLE ${table}(id TEXT, workspace_id TEXT);
      CREATE TRIGGER ${table}_delete AFTER DELETE ON ${table} BEGIN
      INSERT INTO ps_crud(data) VALUES(json_object('type', '${table}', 'id', old.id, 'op', 'DELETE')); END;`);
    sqlite
      .prepare(`INSERT INTO ${table} VALUES (?, ?), (?, ?)`)
      .run(
        "removed-row",
        "removed-workspace",
        "retained-row",
        "retained-workspace"
      );
    sqlite.prepare("INSERT INTO ps_crud(data) VALUES (?)").run(
      JSON.stringify({
        type: table,
        id: "removed-row",
        op: "PATCH",
        data: { name: "Secret" },
      })
    );
    sqlite.prepare("INSERT INTO ps_crud(data) VALUES (?)").run(
      JSON.stringify({
        type: table,
        id: "retained-row",
        op: "PATCH",
        data: { name: "Keep" },
      })
    );
  }
  sqlite.exec(
    "INSERT INTO workspaces VALUES ('removed-workspace', 'removed-org'), ('retained-workspace', 'retained-org')"
  );
  const tx = {
    getAll: async (sql: string, params: string[] = []) =>
      sqlite.prepare(sql).all(...params),
    getOptional: async (sql: string) => sqlite.prepare(sql).get(),
    execute: async (sql: string, params: (string | number)[] = []) =>
      sqlite.prepare(sql).run(...params),
  };
  const db = {
    writeTransaction: async (
      callback: (transaction: typeof tx) => Promise<void>
    ) => {
      sqlite.exec("BEGIN");
      try {
        await callback(tx);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as Database;
  return { sqlite, db, tables };
}

describe("discardOrganizationUploads", () => {
  it("discards scoped pending patches without changing replicated rows or other organizations", async () => {
    const { sqlite, db, tables } = fixture();
    try {
      await discardOrganizationUploads(db, "removed-org", []);
      for (const table of tables) {
        expect(sqlite.prepare(`SELECT id FROM ${table}`).all()).toEqual([
          { id: "removed-row" },
          { id: "retained-row" },
        ]);
      }
      const queue = sqlite.prepare("SELECT data FROM ps_crud").all();
      expect(queue).toHaveLength(tables.length);
      for (const entry of queue) {
        expect(JSON.parse(String(entry.data))).toMatchObject({
          id: "retained-row",
          op: "PATCH",
        });
      }
      expect(sqlite.prepare("SELECT id FROM workspaces").all()).toEqual([
        { id: "removed-workspace" },
        { id: "retained-workspace" },
      ]);
      await discardOrganizationUploads(db, "removed-org", []);
      expect(sqlite.prepare("SELECT data FROM ps_crud").all()).toHaveLength(
        tables.length
      );
    } finally {
      sqlite.close();
    }
  });
  it("uses server workspace IDs when directory rows have already been withdrawn", async () => {
    const { sqlite, db } = fixture();
    try {
      sqlite.exec(
        "DELETE FROM workspaces WHERE organization_id = 'removed-org'"
      );
      await discardOrganizationUploads(db, "removed-org", [
        "removed-workspace",
      ]);
      const queue = sqlite.prepare("SELECT data FROM ps_crud").all();
      expect(
        queue.every((row) => JSON.parse(String(row.data)).id === "retained-row")
      ).toBe(true);
      expect(sqlite.prepare("SELECT id FROM yjs_documents").all()).toHaveLength(
        2
      );
    } finally {
      sqlite.close();
    }
  });
});
