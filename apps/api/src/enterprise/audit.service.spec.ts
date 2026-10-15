import { afterEach, describe, expect, it, mock } from "bun:test";
import { ForbiddenException } from "@nestjs/common";
import { appDrain, registerAuditDrain } from "../instrument";
import { encodeCursor } from "@app/utils/pagination";
import { AuditService } from "./audit.service";

describe("AuditService drain", () => {
  const previousSecret = process.env.AUDIT_LOG_HMAC_SECRET;
  const previousKeyId = process.env.AUDIT_LOG_HMAC_KEY_ID;

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.AUDIT_LOG_HMAC_SECRET;
    } else {
      process.env.AUDIT_LOG_HMAC_SECRET = previousSecret;
    }
    if (previousKeyId === undefined) {
      delete process.env.AUDIT_LOG_HMAC_KEY_ID;
    } else {
      process.env.AUDIT_LOG_HMAC_KEY_ID = previousKeyId;
    }
  });

  it("HMAC-signs and stores normalized audit events", async () => {
    process.env.AUDIT_LOG_HMAC_SECRET =
      "test-signing-secret-at-least-32-characters";
    process.env.AUDIT_LOG_HMAC_KEY_ID = "test-v2";
    const onConflictDoNothing = mock(() => Promise.resolve());
    const values = mock(() => ({ onConflictDoNothing }));
    const insert = mock(() => ({ values }));
    const service = new AuditService({ db: { insert } } as never);

    await appDrain({
      event: {
        audit: {
          action: "workspace.deleted",
          actor: { id: "user_1", type: "user" },
          context: {
            requestId: "request_1",
            tenantId: "organization_1",
          },
          idempotencyKey: "audit-idempotency-1",
          outcome: "success",
          target: { id: "workspace_1", type: "workspace" },
          version: 1,
        },
        environment: "test",
        level: "info",
        service: "lunaris-api",
        timestamp: "2026-07-27T10:00:00.000Z",
      },
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "workspace.deleted",
        actorId: "user_1",
        event: expect.objectContaining({
          audit: expect.objectContaining({
            signature: expect.any(String),
          }),
        }),
        idempotencyKey: "audit-idempotency-1",
        signature: expect.any(String),
        signatureKeyId: "test-v2",
        tenantId: "organization_1",
      }),
    );
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    await service.onApplicationShutdown();
  });

  it("waits for pending audit delivery before unregistering the drain", async () => {
    const service = new AuditService({ db: {} } as never);
    const pending = Promise.withResolvers<void>();
    registerAuditDrain(() => pending.promise);
    const delivery = appDrain({
      event: {
        level: "info",
        service: "api",
        environment: "test",
        timestamp: new Date().toISOString(),
      },
    });
    let closed = false;
    const shutdown = service.onApplicationShutdown().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    pending.resolve();
    await Promise.all([delivery, shutdown]);
    expect(closed).toBe(true);
  });

  it("returns only curated fields and a stable next cursor", async () => {
    const rows = [
      auditRow({
        changes: {
          after: { fields: ["name", "slug", "name", 42] },
        },
        id: "audit_2",
        occurredAt: new Date("2026-07-27T11:00:00.000Z"),
      }),
      auditRow({
        id: "audit_1",
        occurredAt: new Date("2026-07-27T10:00:00.000Z"),
      }),
    ];
    const limit = mock(async () => rows);
    const orderBy = mock(() => ({ limit }));
    const where = mock(() => ({ orderBy }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const service = new AuditService({ db: { select } } as never);

    const page = await service.list("organization_1", { limit: 1 });

    expect(page.items).toEqual([
      {
        action: "organization.updated",
        actorId: "user_1",
        actorType: "user",
        changedFields: ["name", "slug"],
        id: "audit_2",
        occurredAt: "2026-07-27T11:00:00.000Z",
        outcome: "success",
        reason: null,
        requestId: "request_1",
        targetId: "organization_1",
        targetType: "organization",
        traceId: "trace_1",
      },
    ]);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.items[0]).not.toHaveProperty("context");
    expect(page.items[0]).not.toHaveProperty("changes");
    expect(page.items[0]).not.toHaveProperty("signature");
    expect(page.items[0]).not.toHaveProperty("tenantId");
    expect(limit).toHaveBeenCalledWith(2);
    await service.onApplicationShutdown();
  });

  it("allows only organization owners to review events", async () => {
    const owner = auditReviewerService("owner");
    await expect(
      owner.service.assertReviewer("user_1", "organization_1"),
    ).resolves.toBeUndefined();
    await owner.service.onApplicationShutdown();

    for (const role of ["editor", "viewer", undefined]) {
      const reviewer = auditReviewerService(role);
      await expect(
        reviewer.service.assertReviewer("user_1", "organization_1"),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await reviewer.service.onApplicationShutdown();
    }
  });

  it("derives changed field names without exposing their values", async () => {
    const rows = [
      auditRow({
        changes: {
          after: {
            fields: ["name", "name", 42],
            productId: "product_private",
            status: "active",
          },
          before: { version: "1.0.0" },
        },
      }),
    ];
    const limit = mock(async () => rows);
    const orderBy = mock(() => ({ limit }));
    const where = mock(() => ({ orderBy }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const service = new AuditService({ db: { select } } as never);

    const page = await service.list("organization_1", { limit: 50 });

    expect(page.items[0]?.changedFields).toEqual([
      "version",
      "productId",
      "status",
      "name",
    ]);
    expect(JSON.stringify(page.items[0])).not.toContain("product_private");
    expect(JSON.stringify(page.items[0])).not.toContain("1.0.0");
    await service.onApplicationShutdown();
  });

  it("rejects malformed cursors", async () => {
    const service = new AuditService({ db: {} } as never);

    await expect(
      service.list("organization_1", {
        cursor: "not-a-valid-cursor",
        limit: 50,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.list("organization_1", {
        cursor: encodeCursor({
          id: "",
          occurredAt: "2026-07-27T10:00:00.000Z",
        }),
        limit: 50,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await service.onApplicationShutdown();
  });
});

function auditRow(
  overrides: Partial<{
    changes: unknown;
    id: string;
    occurredAt: Date;
  }> = {},
) {
  return {
    action: "organization.updated",
    actorId: "user_1",
    actorType: "user" as const,
    causationId: null,
    changes: null,
    context: { ip: "192.0.2.0", userAgent: "private" },
    correlationId: null,
    event: { audit: { signature: "private" } },
    id: "audit_1",
    idempotencyKey: "idempotency_1",
    ingestedAt: new Date("2026-07-27T10:00:01.000Z"),
    ipAddress: "192.0.2.0",
    occurredAt: new Date("2026-07-27T10:00:00.000Z"),
    outcome: "success" as const,
    reason: null,
    requestId: "request_1",
    schemaVersion: 1,
    signature: "private",
    signatureKeyId: "v1",
    target: { id: "organization_1", type: "organization" },
    targetId: "organization_1",
    targetType: "organization",
    tenantId: "organization_1",
    traceId: "trace_1",
    userAgent: "private",
    ...overrides,
  };
}

function auditReviewerService(role: string | undefined) {
  const limit = mock(async () => (role ? [{ role }] : []));
  const where = mock(() => ({ limit }));
  const from = mock(() => ({ where }));
  const select = mock(() => ({ from }));
  return {
    service: new AuditService({ db: { select } } as never),
  };
}
