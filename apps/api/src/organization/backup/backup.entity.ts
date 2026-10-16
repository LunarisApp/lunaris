import { createId } from "@repo/utils";
import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "../../auth/auth.entity";

export const backupStatusEnum = pgEnum("backup_status", [
  "queued",
  "processing",
  "ready",
  "failed",
  "expired",
]);

export const backupNotificationStatusEnum = pgEnum(
  "backup_notification_status",
  ["pending", "processing", "sent", "failed", "skipped"]
);

export const backupExportsDb = pgTable(
  "backup_exports",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$default(() => createId("backup")),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    requestedByUserId: text().references(() => user.id, {
      onDelete: "set null",
    }),
    status: backupStatusEnum().notNull().default("queued"),
    phase: text().notNull().default("queued"),
    processedFiles: integer().notNull().default(0),
    totalFiles: integer(),
    processedBytes: bigint({ mode: "number" }).notNull().default(0),
    totalBytes: bigint({ mode: "number" }),
    objectKey: text(),
    filename: text(),
    archiveSizeBytes: bigint({ mode: "number" }),
    failureCode: text(),
    attemptCount: integer().notNull().default(0),
    leaseExpiresAt: timestamp(),
    notificationStatus: backupNotificationStatusEnum()
      .notNull()
      .default("pending"),
    notificationAttempts: integer().notNull().default(0),
    notificationLastAttemptAt: timestamp(),
    createdAt: timestamp().notNull().defaultNow(),
    startedAt: timestamp(),
    completedAt: timestamp(),
    expiresAt: timestamp(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("backup_org_created_idx").on(table.organizationId, table.createdAt),
    index("backup_status_lease_idx").on(table.status, table.leaseExpiresAt),
    index("backup_notification_idx").on(
      table.notificationStatus,
      table.notificationLastAttemptAt
    ),
    uniqueIndex("backup_one_active_uidx")
      .on(table.organizationId)
      .where(sql`${table.status} IN ('queued', 'processing')`),
  ]
);

export type BackupExport = typeof backupExportsDb.$inferSelect;
export type BackupStatus = BackupExport["status"];
export type BackupNotificationStatus = BackupExport["notificationStatus"];
