import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "user",
  "system",
  "api",
  "agent",
]);

export const auditOutcomeEnum = pgEnum("audit_outcome", [
  "success",
  "failure",
  "denied",
]);

export const auditEventsDb = pgTable(
  "audit_events",
  {
    id: text().primaryKey(),
    action: text().notNull(),
    actorType: auditActorTypeEnum().notNull(),
    actorId: text().notNull(),
    outcome: auditOutcomeEnum().notNull(),
    targetType: text(),
    targetId: text(),
    tenantId: text(),
    reason: text(),
    changes: jsonb(),
    target: jsonb(),
    context: jsonb(),
    event: jsonb().notNull(),
    requestId: text(),
    traceId: text(),
    ipAddress: text(),
    userAgent: text(),
    causationId: text(),
    correlationId: text(),
    schemaVersion: integer().notNull(),
    idempotencyKey: text().notNull(),
    signature: text().notNull(),
    signatureKeyId: text().notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    ingestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("audit_events_idempotency_unique").on(table.idempotencyKey),
    index("audit_events_tenant_occurred_idx").on(
      table.tenantId,
      table.occurredAt.desc(),
      table.id.desc()
    ),
    index("audit_events_tenant_action_occurred_idx").on(
      table.tenantId,
      table.action,
      table.occurredAt.desc()
    ),
    index("audit_events_actor_occurred_idx").on(
      table.actorId,
      table.occurredAt.desc()
    ),
    index("audit_events_outcome_occurred_idx").on(
      table.outcome,
      table.occurredAt.desc()
    ),
  ]
);
