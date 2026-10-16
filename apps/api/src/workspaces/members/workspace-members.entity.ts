import { createId } from "@repo/utils";
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { member } from "../../auth/auth.entity";
import { workspacesDb } from "../core/workspaces.entity";

export const workspaceRoleEnum = pgEnum("workspace_role", ["editor", "viewer"]);

export const workspaceMembersDb = pgTable(
  "workspace_members",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$default(() => createId("workspace-member")),
    workspaceId: text()
      .notNull()
      .references(() => workspacesDb.id, { onDelete: "cascade" }),
    organizationMemberId: text()
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    unique("workspace_members_workspace_organization_member_unique").on(
      table.workspaceId,
      table.organizationMemberId
    ),
    index("workspace_members_workspace_idx").on(table.workspaceId),
    index("workspace_members_organization_member_idx").on(
      table.organizationMemberId
    ),
  ]
);
