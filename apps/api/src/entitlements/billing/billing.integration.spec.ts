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
import { BILLING_INTERVAL, createPlans } from "@repo/auth/billing";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createAuth } from "@repo/auth/server";
import { eq } from "drizzle-orm";
import { capacityAdapter } from "../../auth/capacity-adapter";
import * as authSchema from "../../auth/auth.entity";
import { SeatService } from "../seats/seat.service";
import { readOrganizationOccupancy } from "../seats/organization-capacity";
import { member, organization, user, invitation } from "../../auth/auth.entity";
import { BillingService } from "./billing.service";
import { subscription } from "./subscription.entity";

// Explicit opt-in; creates and drops only its own isolated database.
const integration =
  process.env.RUN_POSTGRES_BILLING_TESTS === "1" ? describe : describe.skip;

integration("billing entitlement consistency (PostgreSQL)", () => {
  const databaseName = `lunaris_billing_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const config = {
    host: process.env.DATABASE_HOST ?? "localhost",
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  };
  let admin: Pool;
  let pool: Pool;
  let database: DatabaseService;
  let service: BillingService;
  let seats: SeatService;
  let adapter: ReturnType<ReturnType<typeof capacityAdapter>>;

  beforeAll(async () => {
    admin = new Pool({ ...config, database: "postgres" });
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    pool = new Pool({ ...config, database: databaseName, max: 25 });
    const db = drizzle({ client: pool, casing: "snake_case" });
    await migrate(db, { migrationsFolder: "./drizzle" });
    database = { db, pool };
    service = new BillingService(
      database,
      createPlans({
        plusMonthly: "plus-monthly",
        plusYearly: "plus-yearly",
        businessMonthly: "business-monthly",
        businessYearly: "business-yearly",
      }),
      null,
      { frontendUrl: "https://app.example.test" } as never
    );
    await db.insert(user).values({
      id: "owner",
      name: "Owner",
      email: "owner@example.test",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(organization).values({
      id: "org",
      name: "Test",
      slug: "test",
      createdAt: new Date(),
    });
    seats = new SeatService(
      database,
      null,
      { developmentPlan: null } as never,
      service
    );
    const auth = createAuth(db, {
      frontendUrl: "https://app.example.test",
      schema: authSchema,
    });
    adapter = capacityAdapter(database, authSchema, seats)(auth.options);
    await db.insert(user).values(
      ["person-1", "person-2"].map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
  });

  beforeEach(async () => {
    await database.db.delete(subscription);
    await database.db.delete(invitation);
    await database.db.delete(member);
    await database.db.insert(member).values({
      id: "owner-member",
      organizationId: "org",
      userId: "owner",
      role: "owner",
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`
      );
      await admin.end();
    }
  });

  it("accepts concurrent first deliveries and retains newest state", async () => {
    const events = Array.from({ length: 20 }, (_, index) => ({
      canceledAt: null,
      currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
      modifiedAt: new Date(Date.UTC(2026, 8, 1, 0, 0, index)),
      organizationId: "org",
      polarSubscriptionId: "subscription-1",
      productId: index === 19 ? "business-monthly" : "plus-monthly",
      purchasedByUserId: "owner",
      status: "active",
    }));
    // Hold inserts while every delivery reaches a database lock. Without the
    // subscription advisory lock, all deliveries read the same missing row.
    const blocker = await pool.connect();
    await blocker.query("BEGIN");
    await blocker.query("LOCK TABLE subscription IN SHARE MODE");
    const deliveries = Promise.allSettled(
      events.map((event) => service.upsertSubscription(event))
    );
    try {
      const deadline = Date.now() + 5000;
      while (true) {
        const waiting = await admin.query<{ count: number }>(
          "SELECT count(*)::int FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock'",
          [databaseName]
        );
        if (waiting.rows[0]!.count === events.length) {
          break;
        }
        if (Date.now() >= deadline) {
          throw new Error("Webhook deliveries did not reach lock barrier");
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      await deliveries;
    }
    expect(
      (await deliveries).every((result) => result.status === "fulfilled")
    ).toBe(true);
    const rows = await database.db.select().from(subscription);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      modifiedAt: events[19]!.modifiedAt,
      planSlug: "business",
      productId: "business-monthly",
    });

    await Promise.all(
      events
        .slice(0, 19)
        .reverse()
        .map((event) => service.upsertSubscription(event))
    );
    expect(await database.db.select().from(subscription)).toEqual(rows);
  });

  const invite = (email: string) =>
    adapter.create({
      model: "invitation",
      data: {
        organizationId: "org",
        inviterId: "owner",
        email,
        role: "viewer",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      },
    });
  const join = (userId: string) =>
    adapter.create({
      model: "member",
      data: {
        organizationId: "org",
        userId,
        role: "viewer",
        createdAt: new Date(),
      },
    });

  it("shares final-slot enforcement between auth and direct API writes", async () => {
    await invite("reserved@example.test");
    const results = await Promise.allSettled([
      invite("person-1@example.test"),
      seats.withMemberCapacity("org", (tx) =>
        tx.insert(invitation).values({
          id: "agent-invitation",
          organizationId: "org",
          inviterId: "owner",
          email: "person-2@example.test",
          status: "pending",
          role: "viewer",
          expiresAt: new Date(Date.now() + 60_000),
        })
      ),
      join("person-1"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const occupancy = await readOrganizationOccupancy(database.db, "org");
    expect(occupancy.members + occupancy.pendingInvitations).toBe(3);
  });

  it("preserves acceptance reservations and releases them permanently after joining", async () => {
    const first = (await invite("person-1@example.test")) as { id: string };
    await invite("person-2@example.test");
    await adapter.incrementOne({
      model: "invitation",
      where: [
        { field: "id", value: first.id },
        { field: "status", value: "pending" },
      ],
      increment: {},
      set: { status: "accepted" },
    });
    await expect(invite("outsider@example.test")).rejects.toThrow(
      "Organization member limit reached."
    );
    const joined = (await join("person-1")) as { id: string };
    expect(await readOrganizationOccupancy(database.db, "org")).toEqual({
      members: 2,
      pendingInvitations: 1,
    });
    await adapter.delete({
      model: "member",
      where: [{ field: "id", value: joined.id }],
    });
    await expect(invite("outsider@example.test")).resolves.toBeDefined();
  });

  it("rejects concurrent joins above cap and expired invitation resends at capacity", async () => {
    const expired = new Date(Date.now() - 60_000);
    await database.db.insert(invitation).values({
      id: "expired",
      organizationId: "org",
      inviterId: "owner",
      email: "expired@example.test",
      status: "pending",
      expiresAt: expired,
    });
    await join("person-1");
    const results = await Promise.allSettled([
      join("person-2"),
      adapter.update({
        model: "invitation",
        where: [{ field: "id", value: "expired" }],
        update: { expiresAt: new Date(Date.now() + 60_000) },
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const occupancy = await readOrganizationOccupancy(database.db, "org");
    expect(occupancy.members + occupancy.pendingInvitations).toBe(3);
  });

  it("keeps guards inside Better Auth transaction callbacks", async () => {
    await join("person-1");
    await join("person-2");
    await expect(
      adapter.transaction((tx) =>
        tx.create({
          model: "invitation",
          data: {
            organizationId: "org",
            inviterId: "owner",
            email: "overflow@example.test",
            status: "pending",
            role: "viewer",
            expiresAt: new Date(Date.now() + 60_000),
          },
        })
      )
    ).rejects.toThrow("Organization member limit reached.");
  });

  it("accepts an invitation through the real Better Auth endpoint at reserved capacity", async () => {
    const auth = createAuth(database.db, {
      frontendUrl: "https://app.example.test",
      backendUrl: "http://localhost:3000",
      disableEmailVerification: true,
      schema: authSchema,
      database: capacityAdapter(database, authSchema, seats),
    });
    const email = "acceptance@example.test";
    const registered = await auth.api.signUpEmail({
      body: {
        name: "Acceptance",
        email,
        password: "Local-integration-password-123!",
      },
      returnHeaders: true,
    });
    await database.db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, email));
    const invited = (await invite(email)) as { id: string };
    await invite("other-reserved@example.test");
    const cookie = registered.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const response = await auth.handler(
      new Request("http://localhost:3000/auth/organization/accept-invitation", {
        method: "POST",
        body: JSON.stringify({ invitationId: invited.id }),
        headers: {
          cookie,
          "Content-Type": "application/json",
          Origin: "https://app.example.test",
        },
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      member: { organizationId: "org" },
    });
    expect(await readOrganizationOccupancy(database.db, "org")).toEqual({
      members: 2,
      pendingInvitations: 1,
    });
    const [stored] = await database.db
      .select()
      .from(invitation)
      .where(eq(invitation.id, invited.id));
    expect(stored?.seatReserved).toBe(false);
  });

  it("discovers missed activations and revocations across Polar pages", async () => {
    const remote = (id: string, status: string, modified: number) => ({
      id,
      status,
      metadata: { referenceId: "org" },
      customer: { externalId: "owner" },
      productId: "plus-monthly",
      canceledAt: null,
      currentPeriodEnd: new Date("2026-10-01"),
      createdAt: new Date("2026-09-01"),
      modifiedAt: new Date(modified),
    });
    await service.upsertSubscription({
      organizationId: "org",
      purchasedByUserId: "owner",
      polarSubscriptionId: "old",
      productId: "plus-monthly",
      status: "active",
      canceledAt: null,
      currentPeriodEnd: new Date("2026-10-01"),
      modifiedAt: new Date(1),
    });
    const polar = {
      subscriptions: {
        list: mock(async () => [
          { result: { items: [remote("new", "active", 3)] } },
          { result: { items: [remote("old", "canceled", 2)] } },
        ]),
      },
    };
    const billing = new BillingService(
      database,
      createPlans({
        plusMonthly: "plus-monthly",
        plusYearly: "plus-yearly",
        businessMonthly: "business-monthly",
        businessYearly: "business-yearly",
      }),
      polar as never,
      {} as never
    );
    expect(await billing.reconcileSubscriptions()).toEqual({
      checked: 2,
      failed: 0,
    });
    expect((await billing.readActiveSubscription(database.db, "org"))?.id).toBe(
      "new"
    );
    const [old] = await database.db
      .select()
      .from(subscription)
      .where(eq(subscription.polarSubscriptionId, "old"));
    expect(old?.status).toBe("canceled");
  });

  it("serializes a Plus downgrade against the eleventh member", async () => {
    const remote = {
      id: "paid",
      metadata: { referenceId: "org" },
      customer: { externalId: "owner" },
      productId: "business-monthly",
      status: "active",
      canceledAt: null,
      currentPeriodEnd: new Date("2026-10-01"),
      modifiedAt: new Date(2),
      createdAt: new Date(1),
    };
    const polar = {
      subscriptions: {
        list: mock(async () => ({ result: { items: [remote] } })),
        update: mock(async () => ({
          ...remote,
          productId: "plus-monthly",
          modifiedAt: new Date(3),
        })),
      },
    };
    const billing = new BillingService(
      database,
      createPlans({
        plusMonthly: "plus-monthly",
        plusYearly: "plus-yearly",
        businessMonthly: "business-monthly",
        businessYearly: "business-yearly",
      }),
      polar as never,
      {} as never
    );
    await billing.upsertSubscription({
      ...remote,
      organizationId: "org",
      purchasedByUserId: "owner",
      polarSubscriptionId: "paid",
    });
    const people = Array.from({ length: 9 }, (_, i) => ({
      id: `member-${i}`,
      name: "Member",
      email: `member-${i}@example.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await database.db.insert(user).values(people);
    await database.db.insert(member).values(
      people.map(({ id }) => ({
        id: `membership-${id}`,
        userId: id,
        organizationId: "org",
        role: "viewer",
        createdAt: new Date(),
      }))
    );
    const results = await Promise.allSettled([
      billing.changePlan({
        organizationId: "org",
        userId: "owner",
        plan: "plus",
        interval: BILLING_INTERVAL.month,
      }),
      join("person-1"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const active = await billing.readActiveSubscription(database.db, "org");
    const occupancy = await readOrganizationOccupancy(database.db, "org");
    expect(occupancy.members).toBe(active?.planSlug === "plus" ? 10 : 11);
  });

  it("serializes seat writes with membership changes and coalesces duplicate callbacks", async () => {
    await service.upsertSubscription({
      organizationId: "org",
      purchasedByUserId: "owner",
      polarSubscriptionId: "paid",
      productId: "plus-monthly",
      status: "active",
      canceledAt: null,
      currentPeriodEnd: new Date("2026-10-01"),
      modifiedAt: new Date(),
    });
    await join("person-1");
    let remoteSeats = 1;
    let release!: () => void;
    let entered!: () => void;
    const updating = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const update = mock(
      async ({
        subscriptionUpdate,
      }: {
        subscriptionUpdate: { seats: number };
      }) => {
        if (remoteSeats === 1) {
          entered();
          await blocked;
        }
        remoteSeats = subscriptionUpdate.seats;
      }
    );
    const polar = {
      subscriptions: {
        get: mock(async () => ({
          metadata: { referenceId: "org" },
          status: "active",
          seats: remoteSeats,
        })),
        update,
      },
    };
    const seatService = new SeatService(
      database,
      polar as never,
      { developmentPlan: null } as never,
      service
    );
    const first = seatService.syncMemberSeats("org");
    await updating;
    const duplicate = seatService.syncMemberSeats("org");
    const joining = join("person-2").then(() =>
      seatService.syncMemberSeats("org")
    );
    release();
    await Promise.all([first, duplicate, joining]);
    expect(remoteSeats).toBe(3);
    expect(
      update.mock.calls.map(([input]) => input.subscriptionUpdate.seats)
    ).toEqual([2, 3]);
  });

  it("continues seat reconciliation after one provider failure and releases locks", async () => {
    await database.db.insert(organization).values({
      id: "other-org",
      name: "Other",
      slug: "other",
      createdAt: new Date(),
    });
    await database.db.insert(member).values({
      id: "other-owner",
      userId: "owner",
      organizationId: "other-org",
      role: "owner",
      createdAt: new Date(),
    });
    for (const organizationId of ["org", "other-org"]) {
      await service.upsertSubscription({
        organizationId,
        purchasedByUserId: "owner",
        polarSubscriptionId: organizationId,
        productId: "plus-monthly",
        status: "active",
        canceledAt: null,
        currentPeriodEnd: new Date("2026-10-01"),
        modifiedAt: new Date(),
      });
    }
    const update = mock(async () => undefined);
    const polar = {
      subscriptions: {
        update,
        get: mock(async ({ id }: { id: string }) => {
          if (id === "org") {
            throw new Error("Provider unavailable");
          }
          return { metadata: { referenceId: id }, status: "active", seats: 4 };
        }),
      },
    };
    const seatService = new SeatService(
      database,
      polar as never,
      { developmentPlan: null } as never,
      service
    );
    expect(await seatService.reconcileAllMemberSeats()).toEqual({
      checked: 2,
      failed: 1,
      updated: 1,
    });
    expect(update).toHaveBeenCalledWith({
      id: "other-org",
      subscriptionUpdate: { prorationBehavior: "prorate", seats: 1 },
    });
    await expect(join("person-1")).resolves.toBeDefined();
  });
});
