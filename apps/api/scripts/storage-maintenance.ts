/** Run from apps/api: bun --env-file=.env.development scripts/storage-maintenance.ts <command> */
import "reflect-metadata";
import { DatabaseService } from "@app/db";
import { StorageService } from "@app/storage";
import { drizzle } from "drizzle-orm/node-postgres";
import { ConfigService } from "@nestjs/config";
import { StorageConfig } from "@app/storage/storage.config";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { organizationStorageDb } from "../src/files/file-storage.entity";
import { StorageReconciliationService } from "../src/files/storage-reconciliation.service";
import { organization } from "../src/auth/auth.entity";
import { lockOrganizationCapacity } from "../src/entitlements/seats/organization-capacity";
import { subscription } from "../src/entitlements/billing/subscription.entity";

const environment = z
  .object({
    DATABASE_HOST: z.string().min(1),
    DATABASE_PORT: z.coerce.number().int().positive(),
    DATABASE_USER: z.string().min(1),
    DATABASE_PASSWORD: z.string(),
    DATABASE_NAME: z.string().min(1),
    DATABASE_SSL: z.enum(["true", "false"]).default("false"),
    AWS_ENDPOINT_URL: z.url(),
    AWS_DEFAULT_REGION: z.string().min(1),
    AWS_S3_BUCKET: z.string().min(1),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
  })
  .parse(process.env);
const db = new DatabaseService(
  drizzle({
    connection: {
      host: environment.DATABASE_HOST,
      port: environment.DATABASE_PORT,
      user: environment.DATABASE_USER,
      password: environment.DATABASE_PASSWORD,
      database: environment.DATABASE_NAME,
      ssl:
        environment.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : false,
    },
    casing: "snake_case",
  }),
);
const storage = new StorageService(
  new StorageConfig(new ConfigService(environment)),
);
const [command, organizationId, rawBytes] = process.argv.slice(2);
try {
  if (command === "inventory") {
    const inventory = new StorageReconciliationService(db, storage, undefined!);
    if (organizationId) await inventory.inventoryOrganization(organizationId);
    else await inventory.inventory();
  } else if (command === "begin-cutover") {
    await db.db
      .insert(organizationStorageDb)
      .values({
        organizationId: "__rollout__",
        inventoryCompletedAt: new Date(),
      })
      .onConflictDoNothing();
  } else if (command === "enable") {
    await db.db.transaction(async (tx) => {
      const [rollout] = await tx
        .select()
        .from(organizationStorageDb)
        .where(eq(organizationStorageDb.organizationId, "__rollout__"))
        .for("update");
      if (
        !rollout?.inventoryCompletedAt ||
        Date.now() - rollout.inventoryCompletedAt.getTime() < 600_000
      ) {
        throw new Error(
          "Run begin-cutover after removing old upload endpoints, then wait ten minutes for legacy URLs to drain",
        );
      }
      const organizations = await tx
        .select({ id: organization.id })
        .from(organization);
      for (const org of organizations) {
        await lockOrganizationCapacity(tx, org.id);
        const [settings] = await tx
          .select()
          .from(organizationStorageDb)
          .where(eq(organizationStorageDb.organizationId, org.id));
        if (
          !settings?.inventoryCompletedAt ||
          settings.inventoryCompletedAt <=
            new Date(rollout.inventoryCompletedAt.getTime() + 600_000)
        ) {
          throw new Error(
            `Inventory must complete after legacy drain: ${org.id}`,
          );
        }
      }
      await tx.update(organizationStorageDb).set({ enforcementEnabled: true });
    });
  } else if (command === "enterprise-override") {
    const id = z.string().min(1).parse(organizationId);
    const bytes =
      rawBytes === "default"
        ? null
        : z.coerce
            .number()
            .int()
            .min(0)
            .max(Number.MAX_SAFE_INTEGER)
            .parse(rawBytes);
    await db.db.transaction(async (tx) => {
      await lockOrganizationCapacity(tx, id);
      const [active] = await tx
        .select({ id: subscription.polarSubscriptionId })
        .from(subscription)
        .where(
          and(
            eq(subscription.organizationId, id),
            eq(subscription.planSlug, "enterprise"),
            or(
              eq(subscription.status, "active"),
              eq(subscription.status, "trialing"),
            ),
          ),
        );
      if (!active)
        throw new Error(
          "Storage overrides require an active Enterprise contract",
        );
      await tx
        .insert(organizationStorageDb)
        .values({ organizationId: id, enterpriseOverrideBytes: bytes })
        .onConflictDoUpdate({
          target: organizationStorageDb.organizationId,
          set: { enterpriseOverrideBytes: bytes },
        });
    });
  } else
    throw new Error(
      "Expected inventory [organizationId], begin-cutover, enable, or enterprise-override <organizationId> <bytes|default>",
    );
  process.stdout.write(`Storage maintenance completed: ${command}\n`);
} finally {
  await db.pool.end();
  await storage.onModuleDestroy();
}
