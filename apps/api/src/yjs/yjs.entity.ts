import { bytea } from "@app/db/utils";
import { createId } from "@repo/utils";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { user } from "../auth/auth.entity";
import { workspacesDb } from "../workspaces/core/workspaces.entity";

export const yjsDocumentsDb = pgTable(
  "yjs_documents",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$default(() => createId("yjs")),
    workspaceId: text()
      .notNull()
      .references(() => workspacesDb.id, { onDelete: "cascade" }),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
    syncedCreatedAt: timestamp().notNull().defaultNow(),
    syncedUpdatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("yjs_documents_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt.desc(),
      table.id.asc(),
    ),
  ],
);

export const yjsDocumentUpdatesDb = pgTable(
  "yjs_document_updates",
  {
    id: text().primaryKey().notNull().$default(uuidv4),
    workspaceId: text()
      .notNull()
      .references(() => workspacesDb.id, { onDelete: "cascade" }),
    documentId: text()
      .notNull()
      .references(() => yjsDocumentsDb.id, { onDelete: "cascade" }),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    updateData: bytea().notNull(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
    syncedCreatedAt: timestamp().notNull().defaultNow(),
    syncedUpdatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("yjs_doc_updates_doc_created_idx").on(
      table.documentId,
      table.createdAt
    ),
  ]
);
