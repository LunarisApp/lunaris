import { describe, expect, it } from "bun:test";
import { auditEventSchema } from "./audit.schema";

describe("auditEventSchema", () => {
  it("accepts only curated review fields", () => {
    const parsed = auditEventSchema.parse({
      action: "workspace.updated",
      actorId: "user_1",
      actorType: "user",
      changedFields: ["name"],
      changes: { after: { name: "private" } },
      context: { ip: "192.0.2.0" },
      event: { audit: { signature: "private" } },
      id: "audit_1",
      occurredAt: "2026-08-11T10:00:00.000Z",
      outcome: "success",
      reason: null,
      requestId: "request_1",
      signature: "private",
      targetId: "workspace_1",
      targetType: "workspace",
      tenantId: "organization_1",
      traceId: "trace_1",
      userAgent: "private",
    });

    expect(parsed).toEqual({
      action: "workspace.updated",
      actorId: "user_1",
      actorType: "user",
      changedFields: ["name"],
      id: "audit_1",
      occurredAt: "2026-08-11T10:00:00.000Z",
      outcome: "success",
      reason: null,
      requestId: "request_1",
      targetId: "workspace_1",
      targetType: "workspace",
      traceId: "trace_1",
    });
  });
});
