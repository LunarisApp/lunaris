import { createId } from "@repo/utils";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { workspacesDb } from "../core/workspaces.entity";

export const workspaceResourcesDb = pgTable(
  "workspace_resources",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$default(() => createId("res")),
    workspaceId: text()
      .notNull()
      .references(() => workspacesDb.id, { onDelete: "cascade" }),
    name: text().notNull(),
    icon: text(),
    position: integer().notNull().default(0),
    parentId: text().references(() => workspaceResourcesDb.id, {
      onDelete: "cascade",
    }),
    resourceTypeId: text().notNull(),
    schemaVersion: integer().notNull().default(1),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
    lastActivityAt: timestamp(),
    syncedCreatedAt: timestamp().notNull().defaultNow(),
    syncedUpdatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    check(
      "workspace_resources_schema_version_positive",
      sql`${table.schemaVersion} > 0`
    ),
    unique("workspace_resources_id_workspace_unique").on(
      table.id,
      table.workspaceId
    ),
    index("workspace_resources_workspace_position_created_idx").on(
      table.workspaceId,
      table.position,
      table.createdAt,
      table.id
    ),
    index("workspace_resources_workspace_parent_idx").on(
      table.workspaceId,
      table.parentId
    ),
    index("workspace_resources_name_trgm_idx").using(
      "gin",
      table.name.op("gin_trgm_ops")
    ),
  ]
);

export const workspaceResourceTrashDb = pgTable(
  "workspace_resource_trash",
  {
    id: text()
      .primaryKey()
      .notNull()
      .references(() => workspaceResourcesDb.id, { onDelete: "cascade" }),
    workspaceId: text()
      .notNull()
      .references(() => workspacesDb.id, { onDelete: "cascade" }),
    trashRootId: text().notNull(),
    trashedAt: timestamp().notNull(),
    purgeAt: timestamp().notNull(),
    syncedCreatedAt: timestamp().notNull().defaultNow(),
    syncedUpdatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    check(
      "workspace_resource_trash_deadline_valid",
      sql`${table.purgeAt} > ${table.trashedAt}`
    ),
    index("workspace_resource_trash_workspace_purge_idx").on(
      table.workspaceId,
      table.purgeAt
    ),
    index("workspace_resource_trash_workspace_root_idx").on(
      table.workspaceId,
      table.trashRootId
    ),
  ]
);
