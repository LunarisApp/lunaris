import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { createId } from "@repo/utils";
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { organization, user } from "../../auth/auth.entity";

export const workspaceVisibilityEnum = pgEnum(
  "workspace_visibility",
  [
    WORKSPACE_VISIBILITY.shared,
    WORKSPACE_VISIBILITY.private,
    WORKSPACE_VISIBILITY.local,
  ],
);

export const workspacesDb = pgTable(
  "workspaces",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$default(() => createId("workspace")),
    name: text().notNull(),
    slug: text().notNull(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerId: text().references(() => user.id, { onDelete: "cascade" }),
    visibility: workspaceVisibilityEnum().notNull().default(WORKSPACE_VISIBILITY.shared),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
    lastActivityAt: timestamp(),
    syncedCreatedAt: timestamp().notNull().defaultNow(),
    syncedUpdatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("workspaces_org_visibility_updated_idx").on(
      table.organizationId,
      table.visibility,
      table.updatedAt.desc(),
      table.id.asc(),
    ),
    index("workspaces_org_owner_visibility_updated_idx").on(
      table.organizationId,
      table.ownerId,
      table.visibility,
      table.updatedAt.desc(),
      table.id.asc(),
    ),
    unique("workspaces_org_slug_unique").on(table.organizationId, table.slug),
  ]
);
