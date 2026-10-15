import type { DatabaseOrTx } from "@app/db/utils";
import { and, eq, ne, sql } from "drizzle-orm";
import { fileObjectsDb, organizationStorageDb, uploadSessionsDb } from "./file-storage.entity";

export async function readStorageAccounting(db: DatabaseOrTx, organizationId: string) {
  const [committed] = await db
    .select({ value: sql<string>`coalesce(sum(${fileObjectsDb.sizeBytes}), 0)` })
    .from(fileObjectsDb)
    .where(
      and(eq(fileObjectsDb.organizationId, organizationId), ne(fileObjectsDb.state, "deleted")),
    );
  const [reserved] = await db
    .select({ value: sql<string>`coalesce(sum(${uploadSessionsDb.reservedBytes}), 0)` })
    .from(uploadSessionsDb)
    .where(eq(uploadSessionsDb.organizationId, organizationId));
  const [settings] = await db
    .select()
    .from(organizationStorageDb)
    .where(eq(organizationStorageDb.organizationId, organizationId));
  const [rollout] = await db
    .select()
    .from(organizationStorageDb)
    .where(eq(organizationStorageDb.organizationId, "__rollout__"));
  return {
    committedBytes: Number(committed?.value ?? 0),
    reservedBytes: Number(reserved?.value ?? 0),
    verifiedAt: settings?.inventoryCompletedAt?.toISOString() ?? null,
    enforcementEnabled: (settings?.enforcementEnabled || rollout?.enforcementEnabled) ?? false,
    enterpriseOverrideBytes: settings?.enterpriseOverrideBytes,
  };
}
