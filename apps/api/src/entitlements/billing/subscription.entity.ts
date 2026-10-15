import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "../../auth/auth.entity";

/**
 * Polar subscription state for one organization. Only active rows grant paid
 * entitlements. Purchaser deletion is restricted while the organization itself
 * owns the subscription lifecycle.
 */
export const subscription = pgTable(
  "subscription",
  {
    polarSubscriptionId: text("polar_subscription_id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    purchasedByUserId: text("purchased_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    productId: text("product_id").notNull(),
    planSlug: text("plan_slug").notNull(),
    status: text("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end"),
    canceledAt: timestamp("canceled_at"),
    modifiedAt: timestamp("modified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("subscription_organization_status_idx").on(
      table.organizationId,
      table.status,
    ),
    uniqueIndex("subscription_one_access_plan_per_organization_idx")
      .on(table.organizationId)
      .where(sql`${table.status} IN ('active', 'trialing')`),
  ]
);
