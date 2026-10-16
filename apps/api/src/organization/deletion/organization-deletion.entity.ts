import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// No organization FK: completed IDs remain tombstones after content is purged.
// Disaster recovery must reapply these tombstones before serving restored data.
export const organizationDeletionsDb = pgTable(
  "organization_deletions",
  {
    organizationId: text().primaryKey(),
    requestedBy: text(),
    requestedAt: timestamp().notNull(),
    purgeAfter: timestamp().notNull(),
    purgeStartedAt: timestamp(),
    billingStoppedAt: timestamp(),
    notifiedAt: timestamp(),
    reminderSentAt: timestamp(),
    completedAt: timestamp(),
  },
  (table) => [
    index("organization_deletions_due_idx").on(
      table.completedAt,
      table.purgeAfter
    ),
  ]
);
