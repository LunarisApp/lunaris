import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// No cascading foreign keys: accounting and cleanup must survive content/organization deletion.
// These tables are server-owned and deliberately excluded from PowerSync.
export const organizationStorageDb = pgTable(
  "organization_storage",
  {
    organizationId: text().primaryKey(),
    enterpriseOverrideBytes: bigint({ mode: "number" }),
    inventoryCompletedAt: timestamp(),
    enforcementEnabled: boolean().notNull().default(false),
  },
  (t) => [
    check(
      "storage_override_valid",
      sql`${t.enterpriseOverrideBytes} >= 0 AND ${t.enterpriseOverrideBytes} <= 9007199254740991`
    ),
  ]
);

export const fileObjectsDb = pgTable(
  "file_objects",
  {
    key: text().primaryKey(),
    organizationId: text().notNull(),
    workspaceId: text(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    state: text({
      enum: ["live", "orphan", "pending_delete", "deleted"],
    }).notNull(),
    verifiedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("file_objects_organization_idx").on(t.organizationId),
    index("file_objects_cleanup_idx").on(t.state),
    check(
      "file_object_size_valid",
      sql`${t.sizeBytes} >= 0 AND ${t.sizeBytes} <= 9007199254740991`
    ),
  ]
);

export const storedFilesDb = pgTable(
  "stored_files",
  {
    id: text().primaryKey(),
    organizationId: text().notNull(),
    workspaceId: text().notNull(),
    fileId: text().notNull(),
    objectKey: text()
      .notNull()
      .references(() => fileObjectsDb.key),
  },
  (t) => [
    uniqueIndex("stored_files_identity_unique").on(
      t.organizationId,
      t.workspaceId,
      t.fileId
    ),
    index("stored_files_object_idx").on(t.objectKey),
  ]
);

export const uploadSessionsDb = pgTable(
  "file_upload_sessions",
  {
    id: text().primaryKey(),
    organizationId: text().notNull(),
    workspaceId: text().notNull(),
    fileId: text().notNull(),
    replacementFileId: text(),
    replacementStorageId: text(),
    previousObjectKey: text(),
    objectKey: text().notNull().unique(),
    mediaType: text().notNull(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    reservedBytes: bigint({ mode: "number" }).notNull(),
    creditBytes: bigint({ mode: "number" }).notNull().default(0),
    partSize: integer().notNull().default(16_777_216),
    uploadId: text(),
    state: text({
      enum: [
        "creating",
        "uploading",
        "completing",
        "completed",
        "canceling",
        "canceled",
      ],
    }).notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    expiresAt: timestamp().notNull(),
  },
  (t) => [
    index("upload_sessions_organization_idx").on(t.organizationId),
    index("upload_sessions_reconcile_idx").on(t.state, t.expiresAt),
    uniqueIndex("upload_sessions_active_file_unique")
      .on(t.organizationId, t.workspaceId, t.fileId)
      .where(sql`${t.state} NOT IN ('completed', 'canceled')`),
    uniqueIndex("upload_sessions_active_replacement_unique")
      .on(t.organizationId, t.workspaceId, t.replacementFileId)
      .where(sql`${t.state} NOT IN ('completed', 'canceled')`),
    check(
      "upload_session_bytes_valid",
      sql`${t.sizeBytes} >= 0 AND ${t.sizeBytes} <= 5000000000 AND ${t.reservedBytes} >= 0 AND ${t.creditBytes} >= 0`
    ),
  ]
);
