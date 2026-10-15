import type { infer as Infer } from "zod";
import { z } from "zod";
const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const auditOutcomeSchema = z.enum(["success", "failure", "denied"]);
const auditActorTypeSchema = z.enum(["user", "system", "api", "agent"]);

export const auditEventSchema = z.object({
  action: z.string(),
  actorId: z.string(),
  actorType: auditActorTypeSchema,
  changedFields: z.array(z.string()),
  id: z.string(),
  occurredAt: z.string(),
  outcome: auditOutcomeSchema,
  reason: z.string().nullable(),
  requestId: z.string().nullable(),
  targetId: z.string().nullable(),
  targetType: z.string().nullable(),
  traceId: z.string().nullable(),
});

export const AuditEventsQueryDto = paginationQuerySchema
  .extend({
    action: z.string().min(1).optional(),
    actorId: z.string().min(1).optional(),
    from: z.coerce.date().optional(),
    outcome: auditOutcomeSchema.optional(),
    to: z.coerce.date().optional(),
  })
  .meta({ id: "AuditEventsQueryDto" });
export type AuditEventsQueryDto = Infer<typeof AuditEventsQueryDto>;

export const AuditEventsListResponseDto = z
  .object({
    items: z.array(auditEventSchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: "AuditEventsListResponseDto" });
export type AuditEventsListResponseDto = Infer<
  typeof AuditEventsListResponseDto
>;
