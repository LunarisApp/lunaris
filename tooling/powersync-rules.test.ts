import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

interface Stream {
  auto_subscribe?: boolean;
  queries: string[];
  with: Record<string, string>;
}

const { streams } = parse(readFileSync(
  new URL("../infra/local/config/sync_rules.yaml", import.meta.url), "utf8",
)) as { streams: Record<string, Stream> };

// Exercise the checked-in SQL against rows, substituting only PowerSync's
// authentication/subscription functions and the base64 projection. Service
// compilation is checked separately.
let db: Database;
const schemas = {
  organization: "name, slug, logo, created_at, is_personal, yjs_retention_days, deletion_requested_at, deletion_purge_after",
  member: "organization_id, user_id, role, created_at",
  team: "name, organization_id, created_at, updated_at",
  team_member: "team_id, user_id, created_at",
  organization_extension_registries: "organization_id, kind, location, manifest_url, official, added_by, added_at, updated_at",
  user: "name, email, image",
  workspaces: "organization_id, owner_id, visibility",
  workspace_members: "workspace_id, organization_member_id",
  workspace_resources: "workspace_id",
  workspace_resource_trash: "workspace_id",
  workspace_extensions: "workspace_id",
  workspace_storage_slots: "workspace_id",
  workspace_storage_values: "workspace_id",
  yjs_documents: "workspace_id",
  yjs_document_updates: "workspace_id, document_id, user_id, update_data, created_at, updated_at",
};

function insert(table: keyof typeof schemas, row: Record<string, string | null>) {
  const columns = Object.keys(row);
  db.query(`INSERT INTO "${table}" (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
    .run(...Object.values(row));
}

function readStream(name: string, options: {
  user?: string;
  organization?: string;
  workspace?: string;
  access?: string;
} = {}) {
  const stream = streams[name]!;
  const parameters: Record<string, string> = {
    user_id: options.user ?? "owner",
    sub: options.user ?? "owner",
    organization_id: options.organization ?? "org",
    workspace_id: options.workspace ?? "shared",
    sync_access: options.access ?? "cloud",
  };
  const tables: Record<string, Map<string, Record<string, unknown>>> = {};
  for (const query of stream.queries) {
    const ctes = Object.entries(stream.with).map(([key, sql]) => `${key} AS (${sql})`);
    const sql = `WITH ${ctes.join(", ")} ${query}`
      .replaceAll("base64(update_data)", "update_data")
      .replaceAll("auth.user_id()", ":user_id")
      .replace(/(?:auth|subscription)\.parameter\('([^']+)'\)/g, ":$1");
    const bindings = Object.fromEntries([...new Set(sql.match(/:\w+/g))]
      .map((key) => [key, parameters[key.slice(1)]!]));
    const table = query.match(/\bFROM\s+"?(\w+)/i)![1]!;
    const rows = db.query(sql).all(bindings) as Array<{ id: string }>;
    const output = tables[table] ??= new Map();
    for (const row of rows) output.set(row.id, row);
  }
  return Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, [...rows.values()]]));
}

function ids(rows: Array<Record<string, unknown>> | undefined) {
  return rows?.map((row) => row.id).sort();
}

function setDeletion(pending: boolean) {
  db.query("UPDATE organization SET deletion_requested_at = ?, deletion_purge_after = ? WHERE id = 'org'")
    .run(pending ? "2026-09-09" : null, pending ? "2026-10-09" : null);
}

beforeEach(() => {
  db = new Database(":memory:");
  for (const [table, columns] of Object.entries(schemas)) {
    db.exec(`CREATE TABLE "${table}" (id TEXT PRIMARY KEY, ${columns.split(", ").map((column) => `${column} TEXT`).join(", ")})`);
  }
  for (const id of ["org", "other"]) insert("organization", { id, name: id });
  for (const id of ["owner", "peer", "outsider"]) insert("user", { id, name: id });
  insert("member", { id: "own-membership", organization_id: "org", user_id: "owner", role: "owner" });
  insert("member", { id: "peer-membership", organization_id: "org", user_id: "peer", role: "editor" });
  insert("member", { id: "outsider-membership", organization_id: "other", user_id: "outsider", role: "owner" });
  insert("team", { id: "team", organization_id: "org" });
  insert("team_member", { id: "team-member", team_id: "team", user_id: "peer" });
  insert("organization_extension_registries", { id: "registry", organization_id: "org" });
  const workspaces = [
    { id: "shared", organization_id: "org", owner_id: "peer", visibility: "shared" },
    { id: "owned", organization_id: "org", owner_id: "owner", visibility: "private" },
    { id: "invited", organization_id: "org", owner_id: "peer", visibility: "private" },
    { id: "hidden", organization_id: "org", owner_id: "peer", visibility: "private" },
    { id: "foreign", organization_id: "other", owner_id: "outsider", visibility: "shared" },
  ];
  for (const workspace of workspaces) {
    insert("workspaces", workspace);
    for (const table of ["workspace_resources", "workspace_resource_trash", "workspace_extensions", "workspace_storage_slots", "workspace_storage_values", "yjs_documents", "yjs_document_updates"] as const) {
      insert(table, { id: `${table}-${workspace.id}`, workspace_id: workspace.id });
    }
  }
  insert("workspace_members", { id: "invitation", workspace_id: "invited", organization_member_id: "own-membership" });
});
afterEach(() => db.close());

describe("PowerSync stream boundaries", () => {
  it("separates auto-subscribed indexes from subscribed content", () => {
    expect(Object.keys(streams)).toEqual(["organization_index", "organization_directory", "workspace_index", "workspace_content"]);
    expect(streams.organization_index!.auto_subscribe).toBe(true);
    expect(streams.organization_directory!.auto_subscribe).toBe(true);
    expect(streams.workspace_index!.auto_subscribe).toBe(true);
    expect(streams.workspace_content!.auto_subscribe).not.toBe(true);
    expect(streams.workspace_index!.with.accessible_workspaces).toBe(
      streams.workspace_content!.with.accessible_workspaces,
    );
    expect(Object.keys(readStream("organization_index"))).toEqual(["organization", "member"]);
    expect(readStream("organization_directory").organization).toBeUndefined();
    expect(readStream("organization_index").workspaces).toBeUndefined();
    expect(readStream("workspace_index").workspace_storage_values).toBeUndefined();
  });

  it("bounds independently evaluated deletion checks to the selected organization", () => {
    // Final SQL results alone hide this regression: PowerSync evaluates nested
    // parameter queries independently and counts their intermediate results.
    for (let index = 0; index < 1100; index += 1) {
      insert("organization", { id: `unrelated-${index}` });
    }
    for (const name of ["organization_directory", "workspace_index", "workspace_content"]) {
      const sql = Object.values(streams[name]!.with).join("\n");
      // Extract the nested organization SELECT, preserving auth.parameter().
      const query = sql.match(/SELECT id FROM organization\s+WHERE[\s\S]*?deletion_requested_at IS NULL/)?.[0];
      expect(query).toBeDefined();
      const executable = query!.replaceAll("auth.parameter('organization_id')", "'org'");
      expect(db.query(executable).all()).toEqual([{ id: "org" }]);
      setDeletion(true);
      expect(db.query(executable).all()).toEqual([]);
      setDeletion(false);
    }
  });

  it("retains recovery rows but removes other directory metadata while pending", () => {
    expect(ids(readStream("organization_directory").member)).toEqual(["own-membership", "peer-membership"]);
    setDeletion(true);
    const directory = readStream("organization_index");
    expect(directory.organization).toEqual([expect.objectContaining({ id: "org", deletion_requested_at: "2026-09-09", deletion_purge_after: "2026-10-09" })]);
    expect(ids(directory.member)).toEqual(["own-membership"]);
    for (const rows of Object.values(readStream("organization_directory"))) expect(rows).toEqual([]);
  });

  it("withdraws all workspace metadata/content on deletion and restores eligibility", () => {
    const before = [readStream("organization_directory"), readStream("workspace_index"), readStream("workspace_content")];
    setDeletion(true);
    for (const stream of ["organization_directory", "workspace_index", "workspace_content"]) {
      for (const rows of Object.values(readStream(stream))) expect(rows).toEqual([]);
    }
    setDeletion(false);
    expect([readStream("organization_directory"), readStream("workspace_index"), readStream("workspace_content")]).toEqual(before);
    expect(ids(readStream("organization_directory").member)).toEqual(["own-membership", "peer-membership"]);
  });

  it("preserves membership, private workspace, and subscription boundaries", () => {
    expect(ids(readStream("workspace_index").workspaces)).toEqual(["invited", "owned", "shared"]);
    expect(ids(readStream("workspace_index").workspace_members)).toEqual(["invitation"]);
    for (const workspace of ["shared", "owned", "invited"]) {
      for (const rows of Object.values(readStream("workspace_content", { workspace }))) {
        expect(rows).toHaveLength(1);
        expect(rows[0]?.workspace_id).toBe(workspace);
      }
    }
    for (const workspace of ["hidden", "foreign"]) {
      for (const rows of Object.values(readStream("workspace_content", { workspace }))) expect(rows).toEqual([]);
    }
    for (const rows of Object.values(readStream("workspace_index", { organization: "other" }))) expect(rows).toEqual([]);
  });

  it("keeps active organizations available when another organization is pending", () => {
    insert("member", { id: "other-membership", organization_id: "other", user_id: "owner", role: "editor" });
    setDeletion(true);
    expect(ids(readStream("organization_index").organization)).toEqual(["org", "other"]);
    expect(ids(readStream("workspace_index", { organization: "other" }).workspaces)).toEqual(["foreign"]);
  });

  it("switches directory rows to the selected organization only", () => {
    insert("member", { id: "other-membership", organization_id: "other", user_id: "owner", role: "editor" });
    insert("team", { id: "other-team", organization_id: "other" });
    insert("team_member", { id: "other-team-member", team_id: "other-team", user_id: "outsider" });
    insert("organization_extension_registries", { id: "other-registry", organization_id: "other" });
    const index = readStream("organization_index");
    expect(ids(index.organization)).toEqual(["org", "other"]);
    expect(ids(index.member)).toEqual(["other-membership", "own-membership"]);
    const original = readStream("organization_directory");
    expect(ids(original.member)).toEqual(["own-membership", "peer-membership"]);
    expect(ids(original.user)).toEqual(["owner", "peer"]);
    expect(ids(original.team)).toEqual(["team"]);
    expect(ids(original.team_member)).toEqual(["team-member"]);
    expect(ids(original.organization_extension_registries)).toEqual(["org:registry"]);
    const switched = readStream("organization_directory", { organization: "other" });
    expect(ids(switched.member)).toEqual(["other-membership", "outsider-membership"]);
    expect(ids(switched.user)).toEqual(["outsider", "owner"]);
    expect(ids(switched.team)).toEqual(["other-team"]);
    expect(ids(switched.team_member)).toEqual(["other-team-member"]);
    expect(ids(switched.organization_extension_registries)).toEqual(["other:other-registry"]);
    expect(readStream("organization_index", { organization: "other" })).toEqual(index);
    setDeletion(true);
    expect(readStream("organization_directory", { organization: "other" })).toEqual(switched);
  });

  it("does not grant directory access from an organization claim alone", () => {
    for (const organization of ["other", ""]) {
      for (const rows of Object.values(readStream("organization_directory", { organization }))) expect(rows).toEqual([]);
    }
  });

  it("withdraws all organization access after membership removal", () => {
    db.exec("DELETE FROM member WHERE user_id = 'owner'");
    for (const name of Object.keys(streams)) {
      for (const rows of Object.values(readStream(name))) expect(rows).toEqual([]);
    }
  });

  it("does not sync cloud rows to local-only clients", () => {
    for (const name of Object.keys(streams)) {
      for (const rows of Object.values(readStream(name, { access: "local-only" }))) expect(rows).toEqual([]);
    }
  });
});
