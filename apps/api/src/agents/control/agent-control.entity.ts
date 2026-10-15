import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const agentIdempotencyDb = pgTable(
  "agent_idempotency",
  {
    id: text().primaryKey(),
    actorId: text().notNull(),
    createdAt: timestamp().notNull(),
    expiresAt: timestamp().notNull(),
    key: text().notNull(),
    operation: text().notNull(),
    requestHash: text().notNull(),
    response: jsonb(),
    status: text().notNull(),
  },
  (table) => [
    unique("agent_idempotency_actor_key_unique").on(table.actorId, table.key),
    index("agent_idempotency_expires_idx").on(table.expiresAt),
  ],
);

export const agentActionPreviewsDb = pgTable(
  "agent_action_previews",
  {
    id: text().primaryKey(),
    action: text().notNull(),
    actorId: text().notNull(),
    createdAt: timestamp().notNull(),
    expiresAt: timestamp().notNull(),
    fingerprint: text().notNull(),
    impact: jsonb().notNull(),
    targetId: text().notNull(),
    tokenHash: text().notNull().unique(),
    usedAt: timestamp(),
    organizationId: text().notNull(),
  },
  (table) => [
    index("agent_action_previews_actor_idx").on(table.actorId),
    index("agent_action_previews_expires_idx").on(table.expiresAt),
  ],
);

export const agentAuditEventsDb = pgTable(
  "agent_audit_events",
  {
    id: text().primaryKey(),
    actorId: text().notNull(),
    clientId: text(),
    createdAt: timestamp().notNull(),
    durationMs: integer(),
    errorCode: text(),
    operation: text().notNull(),
    requestId: text(),
    status: text().notNull(),
    targetId: text(),
    organizationId: text(),
  },
  (table) => [
    index("agent_audit_events_actor_created_idx").on(
      table.actorId,
      table.createdAt,
    ),
    index("agent_audit_events_organization_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);
