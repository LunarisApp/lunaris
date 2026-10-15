import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { Client } from "pg";

// Opt-in integration test against a disposable schema; always rolled back.
// RUN_DATABASE_TESTS=1 bun test drizzle/0049_activity_timestamps.spec.ts
const migration = readFileSync(new URL("./0049_activity_timestamps.sql", import.meta.url), "utf8");
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")("activity migration in PostgreSQL", () => {
  it("backfills history, propagates content and moves, preserves revisions and ignores replay", async () => {
    const client = new Client({
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT ?? 5432),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
    });
    await client.connect();
    try {
      await client.query(`BEGIN;
        CREATE SCHEMA activity_test_${process.pid};
        SET LOCAL search_path = activity_test_${process.pid};
        CREATE TABLE workspaces(id text PRIMARY KEY, name text, created_at timestamp, updated_at timestamp, synced_updated_at timestamp);
        CREATE TABLE workspace_resources(id text PRIMARY KEY, workspace_id text, parent_id text, name text, created_at timestamp, updated_at timestamp, synced_updated_at timestamp);
        CREATE TABLE workspace_storage_slots(id text PRIMARY KEY, workspace_id text, resource_id text, kind text, backing_id text, updated_at timestamp, synced_updated_at timestamp, metadata jsonb);
        CREATE TABLE workspace_storage_values(id text PRIMARY KEY, workspace_id text, storage_id text, value text, updated_at timestamp, synced_updated_at timestamp);
        CREATE TABLE yjs_documents(id text PRIMARY KEY, workspace_id text, updated_at timestamp);
        CREATE TABLE yjs_document_updates(id text PRIMARY KEY, workspace_id text, document_id text, updated_at timestamp);
        CREATE TABLE workspace_resource_trash(id text PRIMARY KEY, workspace_id text, trashed_at timestamp, purge_at timestamp);
        CREATE TABLE workspace_extensions(id text PRIMARY KEY, workspace_id text, updated_at timestamp);
        CREATE TABLE workspace_members(id text PRIMARY KEY, workspace_id text, updated_at timestamp);
        INSERT INTO workspaces VALUES ('w','Workspace','2026-01-01','2026-01-01',null);
        INSERT INTO workspace_resources VALUES
          ('a','w',null,'Board A','2026-01-01','2026-01-01',null),
          ('b','w',null,'Board B','2026-01-01','2026-01-01',null),
          ('t','w','a','Task','2026-01-01','2026-01-01',null);
        INSERT INTO workspace_storage_slots VALUES ('s','w','t','yjs','d','2026-01-01',null,null);
        INSERT INTO yjs_documents VALUES ('d', 'w', '2026-01-01');
        INSERT INTO yjs_document_updates VALUES ('u','w','d','2026-02-01');
        INSERT INTO workspaces VALUES ('history','History','2026-01-01','2026-01-01',null), ('files','Files','2026-01-01','2026-01-01',null);
        INSERT INTO workspace_resources VALUES ('old-board','history',null,'Board','2026-01-01','2026-01-01',null), ('trashed','history','old-board','Task','2026-01-01','2026-01-01',null);
        INSERT INTO workspace_resource_trash VALUES ('trashed','history','2026-02-15','2026-03-15');
        INSERT INTO workspace_storage_slots VALUES ('workspace-file','files',null,'file','f','2026-02-20',null,'{}');
      `);
      await client.query(migration);
      const activity = async (table: string, id: string) => (await client.query(
        `SELECT to_char(last_activity_at, 'YYYY-MM-DD') AS activity, to_char(updated_at, 'YYYY-MM-DD') AS revision FROM ${table} WHERE id = $1`, [id],
      )).rows[0];
      expect(await activity("workspace_resources", "old-board")).toEqual({ activity: "2026-02-15", revision: "2026-01-01" });
      expect(await activity("workspaces", "history")).toEqual({ activity: "2026-02-15", revision: "2026-01-01" });
      expect(await activity("workspaces", "files")).toEqual({ activity: "2026-02-20", revision: "2026-01-01" });
      expect(await activity("workspace_resources", "a")).toEqual({ activity: "2026-02-01", revision: "2026-01-01" });
      expect(await activity("workspaces", "w")).toEqual({ activity: "2026-02-01", revision: "2026-01-01" });
      await client.query("INSERT INTO yjs_document_updates VALUES ('new','w','d','2026-03-01')");
      expect(await activity("workspace_resources", "a")).toEqual({ activity: "2026-03-01", revision: "2026-01-01" });
      expect((await client.query("SELECT to_char(updated_at, 'YYYY-MM-DD') AS at FROM yjs_documents WHERE id = 'd'")).rows[0].at).toBe("2026-03-01");
      await client.query("INSERT INTO workspace_storage_slots VALUES ('empty','w','t','key-value',NULL,'2026-06-01',NULL,NULL)");
      expect(await activity("workspace_resources", "a")).toEqual({ activity: "2026-03-01", revision: "2026-01-01" });
      await client.query("DELETE FROM yjs_document_updates; INSERT INTO yjs_document_updates VALUES ('compacted','w','d','2026-03-01'), ('old','w','d','2026-02-01')");
      expect(await activity("workspace_resources", "a")).toEqual({ activity: "2026-03-01", revision: "2026-01-01" });
      await client.query("UPDATE workspace_resources SET parent_id = 'b', updated_at = '2026-04-01' WHERE id = 't'");
      for (const id of ["a", "b"]) expect(await activity("workspace_resources", id)).toEqual({ activity: "2026-04-01", revision: "2026-01-01" });
      await client.query("INSERT INTO workspace_storage_values VALUES ('v','w','s','one','2026-05-01',null)");
      expect(await activity("workspace_resources", "b")).toEqual({ activity: "2026-05-01", revision: "2026-01-01" });
      await client.query("UPDATE workspace_storage_values SET updated_at = '2026-06-01' WHERE id = 'v'");
      expect(await activity("workspace_resources", "b")).toEqual({ activity: "2026-05-01", revision: "2026-01-01" });
      await client.query("UPDATE workspace_resources SET last_activity_at = '2026-01-01' WHERE id = 'b'");
      expect(await activity("workspace_resources", "b")).toEqual({ activity: "2026-05-01", revision: "2026-01-01" });
      await client.query("DELETE FROM workspace_storage_values WHERE id = 'v'");
      expect((await activity("workspace_resources", "b")).activity).not.toBe("2026-05-01");
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
