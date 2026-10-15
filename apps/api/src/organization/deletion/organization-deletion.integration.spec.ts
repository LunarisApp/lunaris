import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import type { DatabaseService } from "@app/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { workspacesDb } from "../../workspaces/core/workspaces.entity";
import { yjsDocumentsDb } from "../../yjs/yjs.entity";
import { subscription } from "../../entitlements/billing/subscription.entity";
import { PermissionService } from "../../security/permissions/permission.service";
import { permission } from "@repo/auth/permissions";
import { member, organization, user } from "../../auth/auth.entity";
import { organizationDeletionsDb } from "./organization-deletion.entity";
import {
  OrganizationDeletionService,
  DELETION_GRACE_MS,
} from "./organization-deletion.service";
import { OrganizationDeletionWorker } from "./organization-deletion.worker";
import { assertAuthOrganizationAccess } from "./auth-organization-access";

// Explicit opt-in. Creates an isolated database; never migrates the app database.
const integration =
  process.env.RUN_POSTGRES_DELETION_TESTS === "1" ? describe : describe.skip;
integration("organization deletion (PostgreSQL)", () => {
  const databaseName = `lunaris_deletion_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const config = {
    host: process.env.DATABASE_HOST ?? "localhost",
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  };
  let admin: Pool;
  let pool: Pool;
  let database: DatabaseService;
  let service: OrganizationDeletionService;
  let files: Set<string>;
  let failStorage = false;
  const storage = {
    async putObject(key: string) {
      if (failStorage) throw new Error("Storage unavailable");
      files.add(key);
    },
    async *listObjects(prefix: string) {
      for (const key of files) if (key.startsWith(prefix)) yield { key };
    },
    async deleteObject(key: string) {
      if (failStorage) throw new Error("Storage unavailable");
      files.delete(key);
    },
  };

  beforeAll(async () => {
    admin = new Pool({ ...config, database: "postgres" });
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    pool = new Pool({ ...config, database: databaseName });
    const db = drizzle({ client: pool, casing: "snake_case" });
    await migrate(db, { migrationsFolder: "./drizzle" });
    database = { db, pool };
    service = new OrganizationDeletionService(database);
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
      await admin.end();
    }
  });
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE organization_deletions, organization, "user" CASCADE',
    );
    await database.db.insert(user).values({
      id: "owner",
      name: "Owner",
      email: "owner@example.test",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await database.db.insert(user).values({
      id: "viewer",
      name: "Viewer",
      email: "viewer@example.test",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await database.db.insert(organization).values([
      { id: "org", name: "Test", slug: "test", createdAt: new Date() },
      { id: "other", name: "Other", slug: "other", createdAt: new Date() },
    ]);
    await database.db.insert(member).values([
      {
        id: "owner-member",
        organizationId: "org",
        userId: "owner",
        role: "owner",
        createdAt: new Date(),
      },
      {
        id: "viewer-member",
        organizationId: "org",
        userId: "viewer",
        role: "viewer",
        createdAt: new Date(),
      },
    ]);
    files = new Set([
      "files/org/file",
      "backups/org/export.zip",
      "files/other/file",
      "files/org-neighbor/file",
    ]);
    failStorage = false;
  });
  const schedule = () =>
    service.requestDeletion({ id: "owner" }, "org", "test", new Date());
  const worker = () =>
    new OrganizationDeletionWorker(database, storage as never, null, null, {
      frontendUrl: "https://app.lunaris.test",
      appRegion: "eu",
    } as never);
  const expire = () =>
    database.db
      .update(organizationDeletionsDb)
      .set({ purgeAfter: new Date(Date.now() - 1000) })
      .where(eq(organizationDeletionsDb.organizationId, "org"));

  it("enforces owner, slug, fresh session, and personal organization restrictions", async () => {
    await expect(
      service.requestDeletion({ id: "viewer" }, "org", "test", new Date()),
    ).rejects.toThrow("Only organization owners");
    await expect(
      service.requestDeletion({ id: "owner" }, "org", "wrong", new Date()),
    ).rejects.toThrow("slug does not match");
    await expect(
      service.requestDeletion({ id: "owner" }, "org", "test", new Date(0)),
    ).rejects.toThrow("sign in again");
    await database.db
      .update(organization)
      .set({ isPersonal: true })
      .where(eq(organization.id, "org"));
    await expect(schedule()).rejects.toThrow("personal organization");
    expect(
      await database.db.select().from(organizationDeletionsDb),
    ).toHaveLength(0);
  });
  it("schedules once, blocks access, and lets owners restore before deadline", async () => {
    const first = await schedule();
    expect(new Date(first.purgeAfter!).getTime() - Date.now()).toBeGreaterThan(
      DELETION_GRACE_MS - 5000,
    );
    expect((await schedule()).purgeAfter).toBe(first.purgeAfter);
    expect((await service.getStatus("viewer", "org")).canRestore).toBe(false);
    await expect(service.restore("viewer", "org")).rejects.toThrow(
      "Only organization owners",
    );
    const permissions = new PermissionService(database);
    expect(
      await permissions.hasPermission(permission.content.write, {
        organizationId: "org",
        userId: "owner",
        role: "owner",
      }),
    ).toBe(false);
    await expect(
      assertAuthOrganizationAccess(database.db, {
        path: "/organization/update",
        body: { organizationId: "org" },
        activeOrganizationId: "other",
      }),
    ).rejects.toThrow("scheduled for deletion");
    expect((await service.restore("owner", "org")).status).toBe("active");
    expect(
      await permissions.hasPermission(permission.content.write, {
        organizationId: "org",
        userId: "owner",
      }),
    ).toBe(true);
    await worker().processPending();
    expect(files.size).toBe(4);
  });
  it("purges only after deadline, preserves users and neighboring organizations", async () => {
    await schedule();
    await worker().processPending();
    expect(files.size).toBe(4);
    await expire();
    await expect(service.restore("owner", "org")).rejects.toThrow(
      "recovery period has ended",
    );
    await worker().processPending();
    expect([...files]).toEqual([
      "files/other/file",
      "files/org-neighbor/file",
      "organization-deletions/org.json",
    ]);
    expect(await database.db.select().from(organization)).toHaveLength(1);
    expect(await database.db.select().from(user)).toHaveLength(2);
    const [tombstone] = await database.db
      .select()
      .from(organizationDeletionsDb);
    expect(tombstone?.completedAt).toBeInstanceOf(Date);
    expect(tombstone?.requestedBy).toBeNull();
  });
  it("cancels billing with retries, sends one notice, and revokes subscription at purge", async () => {
    await database.db.insert(workspacesDb).values({
      id: "workspace-1",
      name: "Private documents",
      slug: "docs",
      organizationId: "org",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await database.db.insert(yjsDocumentsDb).values({
      id: "document-1",
      workspaceId: "workspace-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await database.db.insert(subscription).values({
      polarSubscriptionId: "sub-1",
      organizationId: "org",
      purchasedByUserId: "owner",
      productId: "product",
      planSlug: "business",
      status: "active",
    });
    let billingFails = true;
    let canceled = false;
    const update = mock(async () => {
      if (billingFails) throw new Error("Polar unavailable");
      canceled = true;
    });
    const revoke = mock(async () => undefined);
    const polar = {
      subscriptions: {
        list: async () => ({
          async *[Symbol.asyncIterator]() {
            yield {
              result: { items: [{ id: "sub-1", cancelAtPeriodEnd: canceled }] },
            };
          },
        }),
        update,
        revoke,
      },
    };
    const send = mock(async (_message: { text: string }) => ({
      data: { id: "email-1" },
      error: null,
    }));
    const processor = new OrganizationDeletionWorker(
      database,
      storage as never,
      polar as never,
      { emails: { send } } as never,
      { frontendUrl: "https://app.lunaris.test", appRegion: "eu" } as never,
    );
    const status = await schedule();
    expect(status.workspaceIds).toEqual(["workspace-1"]);
    await processor.processPending();
    expect((await service.getStatus("owner", "org")).billingStopped).toBe(
      false,
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].text).toContain(
      "https://app.lunaris.test/test?region=eu",
    );
    billingFails = false;
    await processor.processPending();
    await processor.processPending();
    expect((await service.getStatus("owner", "org")).billingStopped).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    await database.db
      .update(organizationDeletionsDb)
      .set({ purgeAfter: new Date(Date.now() + 24 * 60 * 60 * 1000) })
      .where(eq(organizationDeletionsDb.organizationId, "org"));
    await processor.processPending();
    expect(send).toHaveBeenCalledTimes(2);
    await expire();
    await processor.processPending();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(await database.db.select().from(workspacesDb)).toHaveLength(0);
    expect(await database.db.select().from(yjsDocumentsDb)).toHaveLength(0);
    expect(await database.db.select().from(subscription)).toHaveLength(0);
    expect(await database.db.select().from(user)).toHaveLength(2);
  });
  it("cannot bypass suspension with unrelated auth body IDs", async () => {
    await database.db.insert(member).values({
      id: "other-member",
      organizationId: "other",
      userId: "owner",
      role: "owner",
      createdAt: new Date(),
    });
    await schedule();
    for (const body of [
      { organizationId: "org", memberId: "other-member" },
      { memberId: "other-member" },
      { data: { organizationId: "other" } },
      { organizationId: "" },
    ]) {
      await expect(
        assertAuthOrganizationAccess(database.db, {
          path: "/organization/update",
          body,
          activeOrganizationId: "org",
        }),
      ).rejects.toThrow("scheduled for deletion");
    }
    await expect(
      assertAuthOrganizationAccess(database.db, {
        path: "/organization/update-member-role",
        body: { organizationId: "other", memberId: "owner-member" },
        activeOrganizationId: "other",
      }),
    ).rejects.toThrow("scheduled for deletion");
  });
  it("checks the active organization for customer portals despite unrelated body IDs", async () => {
    await schedule();
    await expect(
      assertAuthOrganizationAccess(database.db, {
        path: "/customer/portal",
        body: { organizationId: "other" },
        activeOrganizationId: "org",
      }),
    ).rejects.toThrow("scheduled for deletion");
  });
  it("keeps billing cancellation committed when owner notification fails", async () => {
    await schedule();
    let failEmail = true;
    const send = mock(async () =>
      failEmail
        ? { data: null, error: { message: "Email unavailable" } }
        : { data: { id: "email" }, error: null },
    );
    const processor = new OrganizationDeletionWorker(
      database,
      storage as never,
      null,
      { emails: { send } } as never,
      { frontendUrl: "https://app.lunaris.test", appRegion: "eu" } as never,
    );
    await processor.processPending();
    expect((await service.getStatus("owner", "org")).billingStopped).toBe(true);
    expect(
      (await database.db.select().from(organizationDeletionsDb))[0]?.notifiedAt,
    ).toBeNull();
    failEmail = false;
    await processor.processPending();
    expect(
      (await database.db.select().from(organizationDeletionsDb))[0]?.notifiedAt,
    ).toBeInstanceOf(Date);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("keeps email retry content stable when billing recovers", async () => {
    await schedule();
    let billingFails = true;
    const send = mock(
      async (
        _message: { text: string },
        _options: { idempotencyKey: string },
      ) => ({
        data: null,
        error: { message: "Delivery response lost" },
      }),
    );
    const polar = {
      subscriptions: {
        list: async () => {
          if (billingFails) throw new Error("Billing unavailable");
          return {
            async *[Symbol.asyncIterator]() {
              yield { result: { items: [] } };
            },
          };
        },
      },
    };
    const processor = new OrganizationDeletionWorker(
      database,
      storage as never,
      polar as never,
      { emails: { send } } as never,
      { frontendUrl: "https://app.lunaris.test", appRegion: "eu" } as never,
    );
    await processor.processPending();
    billingFails = false;
    await processor.processPending();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    expect((await service.getStatus("owner", "org")).billingStopped).toBe(true);
  });

  it("returns explicit unavailable status for a missing membership", async () => {
    expect((await service.getStatus("outsider", "org")).status).toBe(
      "unavailable",
    );
    expect((await service.getStatus("owner", "missing")).status).toBe(
      "unavailable",
    );
  });
  it("reapplies deletion tombstones after a database restore", async () => {
    files.add("organization-deletions/org.json");
    await worker().onModuleInit();
    expect((await service.getStatus("owner", "org")).status).toBe("purging");
    await expect(service.restore("owner", "org")).rejects.toThrow(
      "recovery period has ended",
    );
    await worker().processPending();
    expect(
      await database.db
        .select()
        .from(organization)
        .where(eq(organization.id, "org")),
    ).toHaveLength(0);
  });
  it("keeps purge irreversible after failure, then retries safely", async () => {
    await schedule();
    await expire();
    failStorage = true;
    await worker().processPending();
    const [deletion] = await database.db.select().from(organizationDeletionsDb);
    expect(deletion?.purgeStartedAt).toBeInstanceOf(Date);
    expect(deletion?.completedAt).toBeNull();
    await expect(service.restore("owner", "org")).rejects.toThrow(
      "recovery period has ended",
    );
    failStorage = false;
    await Promise.all([worker().processPending(), worker().processPending()]);
    expect(
      (await database.db.select().from(organizationDeletionsDb))[0]
        ?.completedAt,
    ).toBeInstanceOf(Date);
  });
});
