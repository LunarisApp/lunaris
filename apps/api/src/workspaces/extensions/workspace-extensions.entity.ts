import { createId } from "@repo/utils";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { workspacesDb } from "../core/workspaces.entity";

export const workspaceExtensionsDb = pgTable(
  "workspace_extensions",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$default(() => createId("workspace-extension")),
    workspaceId: text()
      .notNull()
      .references(() => workspacesDb.id, { onDelete: "cascade" }),
    extensionId: text().notNull(),
    enabled: boolean().notNull().default(true),
    registryId: text(),
    version: text(),
    descriptorUrl: text(),
    descriptorBytes: integer(),
    descriptorSha256: text(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
    syncedCreatedAt: timestamp().notNull().defaultNow(),
    syncedUpdatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    unique("workspace_extensions_workspace_extension_unique").on(
      table.workspaceId,
      table.extensionId,
    ),
    index("workspace_extensions_workspace_enabled_idx").on(
      table.workspaceId,
      table.enabled,
    ),
  ],
);
