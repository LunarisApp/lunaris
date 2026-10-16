import { createId } from "@repo/utils";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspacesDb } from "../core/workspaces.entity";
import { workspaceResourcesDb } from "../resources/workspace-resources.entity";

export const workspaceStorageSlotsDb = pgTable(
  "workspace_storage_slots",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$default(() => createId("storage")),
    workspaceId: text()
      .notNull()
      .references(() => workspacesDb.id, { onDelete: "cascade" }),
    resourceId: text().references(() => workspaceResourcesDb.id, {
      onDelete: "cascade",
    }),
    pluginId: text(),
    name: text().notNull(),
    kind: text().notNull(),
    backingId: text(),
    metadata: text(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
    syncedCreatedAt: timestamp().notNull().defaultNow(),
    syncedUpdatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    check(
      "workspace_storage_slots_scope_check",
      sql`(${table.resourceId} IS NOT NULL AND ${table.pluginId} IS NULL) OR (${table.resourceId} IS NULL AND ${table.pluginId} IS NOT NULL)`
    ),
    check(
      "workspace_storage_slots_kind_check",
      sql`${table.kind} IN ('file', 'key-value', 'yjs')`
    ),
    check(
      "workspace_storage_slots_backing_check",
      sql`(${table.kind} = 'key-value' AND ${table.backingId} IS NULL) OR (${table.kind} IN ('file', 'yjs') AND ${table.backingId} IS NOT NULL)`
    ),
    unique("workspace_storage_slots_id_workspace_unique").on(
      table.id,
      table.workspaceId
    ),
    foreignKey({
      columns: [table.resourceId, table.workspaceId],
      foreignColumns: [
        workspaceResourcesDb.id,
        workspaceResourcesDb.workspaceId,
      ],
      name: "workspace_storage_slots_resource_workspace_fk",
    }).onDelete("cascade"),
    uniqueIndex("workspace_storage_slots_resource_name_unique")
      .on(table.resourceId, table.name)
      .where(sql`${table.resourceId} IS NOT NULL`),
    uniqueIndex("workspace_storage_slots_workspace_plugin_name_unique")
      .on(table.workspaceId, table.pluginId, table.name)
      .where(sql`${table.resourceId} IS NULL`),
    index("workspace_storage_slots_workspace_idx").on(table.workspaceId),
    index("workspace_storage_slots_resource_idx").on(table.resourceId),
  ]
);

export const workspaceStorageValuesDb = pgTable(
  "workspace_storage_values",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$default(() => createId("storage-value")),
    storageId: text()
      .notNull()
      .references(() => workspaceStorageSlotsDb.id, { onDelete: "cascade" }),
    workspaceId: text()
      .notNull()
      .references(() => workspacesDb.id, { onDelete: "cascade" }),
    key: text().notNull(),
    value: text().notNull(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
    syncedCreatedAt: timestamp().notNull().defaultNow(),
    syncedUpdatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    unique("workspace_storage_values_storage_key_unique").on(
      table.storageId,
      table.key
    ),
    foreignKey({
      columns: [table.storageId, table.workspaceId],
      foreignColumns: [
        workspaceStorageSlotsDb.id,
        workspaceStorageSlotsDb.workspaceId,
      ],
      name: "workspace_storage_values_storage_workspace_fk",
    }).onDelete("cascade"),
    index("workspace_storage_values_workspace_idx").on(table.workspaceId),
  ]
);
