import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ForbiddenException } from "@nestjs/common";
import { createId } from "@repo/utils";
import { and, desc, eq, gte, lt, lte, or, type SQL } from "drizzle-orm";
import type { DrainContext, DrainFn } from "evlog";
import { AUDIT_SCHEMA_VERSION, auditOnly, signed } from "evlog";
import { auditEventsDb } from "./audit.entity";
import type { AuditEventsQueryDto } from "./audit.schema";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** App-owned database, identity lookup, log lifecycle, and pagination adapters. */
export interface AuditDependencies {
  db: Pick<NodePgDatabase, "select" | "insert">;
  decodeCursor: <T>(cursor: string | undefined, parse: (value: unknown) => T) => T | undefined;
  flushLogDrain: () => Promise<void>;
  getMemberRole: (userId: string, tenantId: string) => Promise<string | undefined>;
  registerAuditDrain: (drain: DrainFn) => void;
  toPage: <Row, Item>(params: {
    encode: (row: Row) => unknown;
    limit: number;
    map: (row: Row) => Item;
    rows: Row[];
  }) => Page<Item>;
  unregisterAuditDrain: () => void;
}

const REVIEWER_ROLES = new Set(["owner"]);

type AuditRow = typeof auditEventsDb.$inferSelect;
type AuditCursor = { id: string; occurredAt: string };

export class AuditService {
  private readonly signatureKeyId: string;

  constructor(private readonly dependencies: AuditDependencies) {
    const secret =
      process.env.AUDIT_LOG_HMAC_SECRET ??
      (process.env.NODE_ENV === "production"
        ? undefined
        : "local-audit-secret-do-not-use-in-production");
    if (!secret) {
      throw new Error("AUDIT_LOG_HMAC_SECRET is required in production");
    }
    if (secret.length < 32) {
      throw new Error("AUDIT_LOG_HMAC_SECRET must be at least 32 characters");
    }
    this.signatureKeyId = process.env.AUDIT_LOG_HMAC_KEY_ID ?? "v1";
    const drain = auditOnly(
      signed(this.write.bind(this), { secret, strategy: "hmac" }),
      { await: true },
    );
    dependencies.registerAuditDrain(drain);
  }

  // HTTP requests finish before this hook; Drizzle closes its pool afterward.
  async onApplicationShutdown() {
    await this.dependencies.flushLogDrain();
    this.dependencies.unregisterAuditDrain();
  }

  async assertReviewer(userId: string, tenantId: string): Promise<void> {
    const role = await this.dependencies.getMemberRole(userId, tenantId);
    const roles = role?.split(",")
      .map((role) => role.trim())
      .filter(Boolean);
    if (!roles?.some((role) => REVIEWER_ROLES.has(role))) {
      throw new ForbiddenException(
        "Organization owner role required to review audit events",
      );
    }
  }

  async list(
    tenantId: string,
    query: AuditEventsQueryDto,
  ): Promise<Page<ReturnType<typeof mapAuditRow>>> {
    const cursor = this.dependencies.decodeCursor(query.cursor, parseCursor);
    const conditions: SQL[] = [eq(auditEventsDb.tenantId, tenantId)];
    if (query.action) conditions.push(eq(auditEventsDb.action, query.action));
    if (query.actorId) {
      conditions.push(eq(auditEventsDb.actorId, query.actorId));
    }
    if (query.outcome) {
      conditions.push(eq(auditEventsDb.outcome, query.outcome));
    }
    if (query.from) {
      conditions.push(gte(auditEventsDb.occurredAt, query.from));
    }
    if (query.to) conditions.push(lte(auditEventsDb.occurredAt, query.to));
    if (cursor) {
      const occurredAt = new Date(cursor.occurredAt);
      conditions.push(
        or(
          lt(auditEventsDb.occurredAt, occurredAt),
          and(
            eq(auditEventsDb.occurredAt, occurredAt),
            lt(auditEventsDb.id, cursor.id),
          ),
        )!,
      );
    }

    const rows = await this.dependencies.db
      .select()
      .from(auditEventsDb)
      .where(and(...conditions))
      .orderBy(desc(auditEventsDb.occurredAt), desc(auditEventsDb.id))
      .limit(query.limit + 1);

    return this.dependencies.toPage({
      encode: (row) => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
      }),
      limit: query.limit,
      map: mapAuditRow,
      rows,
    });
  }

  private readonly write: DrainFn = async (ctx: DrainContext) => {
    const audit = ctx.event.audit;
    if (!audit?.signature || !audit.idempotencyKey) {
      throw new Error("Signed audit event is missing integrity fields");
    }
    const context = audit.context ?? {};
    await this.dependencies.db
      .insert(auditEventsDb)
      .values({
        action: audit.action,
        actorId: audit.actor.id,
        actorType: audit.actor.type,
        causationId: audit.causationId,
        changes: audit.changes,
        context,
        correlationId: audit.correlationId,
        event: ctx.event,
        id: createId("audit"),
        idempotencyKey: audit.idempotencyKey,
        ipAddress: stringValue(context.ip),
        occurredAt: parseEventTimestamp(ctx.event.timestamp),
        outcome: audit.outcome,
        reason: audit.reason,
        requestId: stringValue(context.requestId),
        schemaVersion: audit.version ?? AUDIT_SCHEMA_VERSION,
        signature: audit.signature,
        signatureKeyId: this.signatureKeyId,
        target: audit.target,
        targetId: audit.target?.id,
        targetType: audit.target?.type,
        tenantId: stringValue(context.tenantId),
        traceId: stringValue(context.traceId),
        userAgent: stringValue(context.userAgent),
      })
      .onConflictDoNothing({
        target: auditEventsDb.idempotencyKey,
      });
  };
}

function mapAuditRow(row: AuditRow) {
  return {
    action: row.action,
    actorId: row.actorId,
    actorType: row.actorType,
    changedFields: parseChangedFields(row.changes),
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    outcome: row.outcome,
    reason: row.reason,
    requestId: row.requestId,
    targetId: row.targetId,
    targetType: row.targetType,
    traceId: row.traceId,
  };
}

function parseChangedFields(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const changedFields = new Set<string>();

  for (const phaseName of ["before", "after"] as const) {
    const phase = phaseName === "before"
      ? ("before" in value ? value.before : undefined)
      : ("after" in value ? value.after : undefined);
    if (!phase || typeof phase !== "object" || Array.isArray(phase)) continue;

    for (const field of Object.keys(phase)) {
      if (field !== "fields") changedFields.add(field);
    }

    const fields = "fields" in phase ? phase.fields : undefined;
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      if (typeof field === "string" && field.length > 0) {
        changedFields.add(field);
      }
    }
  }

  return [...changedFields];
}

function parseCursor(value: unknown): AuditCursor {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    !("occurredAt" in value) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.occurredAt !== "string" ||
    Number.isNaN(Date.parse(value.occurredAt))
  ) {
    throw new Error("Invalid audit cursor");
  }
  return { id: value.id, occurredAt: value.occurredAt };
}

function parseEventTimestamp(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
