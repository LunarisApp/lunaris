import { describe, expect, it } from "bun:test";
import { oauthProvider } from "@better-auth/oauth-provider";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  authSchema,
  oauthClientResource,
  oauthResource,
  passkey,
  session,
  team,
  teamMember,
} from "./auth.entity";

describe("passkey auth schema", () => {
  it("provides every field required by the installed OAuth provider", () => {
    const provider = oauthProvider({
      loginPage: "/auth",
      consentPage: "/auth/agent-consent",
    });

    for (const [modelName, model] of Object.entries(provider.schema)) {
      const table = authSchema[modelName as keyof typeof authSchema];
      expect(table, modelName).toBeDefined();
      const columns = getTableColumns(table);
      for (const field of Object.keys(model.fields)) {
        expect(columns, `${modelName}.${field}`).toHaveProperty(field);
      }
    }
  });

  it("exposes Better Auth passkey fields, indexes, and the user foreign key", () => {
    const columns = getTableColumns(passkey);
    const config = getTableConfig(passkey);

    expect(authSchema.passkey).toBe(passkey);
    expect(Object.keys(columns)).toEqual([
      "id",
      "name",
      "publicKey",
      "userId",
      "credentialID",
      "counter",
      "deviceType",
      "backedUp",
      "transports",
      "createdAt",
      "aaguid",
    ]);
    expect(config.indexes.map((index) => index.config.name).sort()).toEqual([
      "passkey_credentialID_idx",
      "passkey_userId_idx",
    ]);
    expect(config.foreignKeys).toHaveLength(1);
    expect(config.foreignKeys[0]?.onDelete).toBe("cascade");
  });

  it("keeps the generated migration additive", async () => {
    const migration = await Bun.file(
      new URL("../../drizzle/0022_closed_human_fly.sql", import.meta.url),
    ).text();

    expect(migration).toContain('CREATE TABLE "passkey"');
    expect(migration).toContain('CREATE INDEX "passkey_userId_idx"');
    expect(migration).toContain('CREATE INDEX "passkey_credentialID_idx"');
    expect(migration).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE)\b/im);
  });

  it("adds agent credentials and safety tables without destructive schema changes", async () => {
    const migration = await Bun.file(
      new URL(
        "../../drizzle/0027_cultured_serpent_society.sql",
        import.meta.url,
      ),
    ).text();

    expect(migration).toContain('CREATE TABLE "apikey"');
    expect(migration).toContain('CREATE TABLE "oauth_access_token"');
    expect(migration).toContain('CREATE TABLE "agent_action_previews"');
    expect(migration).toContain('CREATE TABLE "agent_audit_events"');
    expect(migration).toContain('"request_hash" text NOT NULL');
    expect(migration).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE)\b/im);
  });

  it("binds OAuth grants to resources with an additive migration", async () => {
    const migration = await Bun.file(
      new URL("../../drizzle/0028_living_monster_badoon.sql", import.meta.url),
    ).text();

    expect(authSchema.oauthResource).toBe(oauthResource);
    expect(authSchema.oauthClientResource).toBe(oauthClientResource);
    expect(migration).toContain('CREATE TABLE "oauth_resource"');
    expect(migration).toContain('CREATE TABLE "oauth_client_resource"');
    expect(migration).toContain(
      'ALTER TABLE "oauth_refresh_token" ADD COLUMN "resources" text[]',
    );
    expect(migration).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE)\b/im);
  });

  it("adds organization team storage with an additive migration", async () => {
    const teamColumns = getTableColumns(team);
    const teamMemberColumns = getTableColumns(teamMember);
    const sessionColumns = getTableColumns(session);
    const migration = await Bun.file(
      new URL("../../drizzle/0041_married_midnight.sql", import.meta.url),
    ).text();

    expect(authSchema.team).toBe(team);
    expect(authSchema.teamMember).toBe(teamMember);
    expect(teamColumns.memberCount?.notNull).toBe(true);
    expect(teamMemberColumns.membershipKey?.isUnique).toBe(true);
    expect(sessionColumns.activeTeamId).toBeDefined();
    expect(migration).toContain('CREATE TABLE "team"');
    expect(migration).toContain('CREATE TABLE "team_member"');
    expect(migration).toContain(
      'ALTER TABLE "invitation" ADD COLUMN "team_id" text',
    );
    expect(migration).toContain(
      "ALTER PUBLICATION powersync ADD TABLE team, team_member",
    );
    expect(migration).toContain('WHERE "is_personal" = false');
    expect(migration).toContain(
      "string_to_array(replace(member.\"role\", ' ', ''), ',')",
    );
    expect(migration).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE)\b/im);
  });
});
