import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { organization, user } from "../../auth/auth.entity";

export const organizationExtensionRegistriesDb = pgTable(
  "organization_extension_registries",
  {
    id: text().notNull(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text({ enum: ["github", "https"] }).notNull(),
    location: text().notNull(),
    manifestUrl: text().notNull(),
    official: boolean().notNull().default(false),
    addedBy: text().references(() => user.id, { onDelete: "set null" }),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("organization_extension_registries_org_location_unique").on(
      table.organizationId,
      table.location
    ),
    index("organization_extension_registries_org_added_idx").on(
      table.organizationId,
      table.addedAt
    ),
  ]
);
