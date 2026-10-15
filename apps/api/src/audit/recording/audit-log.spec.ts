import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type MockAudit, mockAudit } from "evlog";
import { mockEvlogLogger } from "../../../test/preload";
import {
  recordComplianceAudit,
  recordStandaloneComplianceAudit,
} from "./audit-log";

const input = {
  action: "workspace.updated",
  actor: { id: "user_1", type: "user" as const },
  outcome: "success" as const,
  target: { id: "workspace_1", type: "workspace" },
};

describe("recordComplianceAudit", () => {
  beforeEach(() => {
    mockEvlogLogger.audit.mockClear();
    mockEvlogLogger.audit.deny.mockClear();
    mockEvlogLogger.set.mockClear();
  });

  it("assigns a unique idempotency key to each logical event", () => {
    recordComplianceAudit(mockEvlogLogger as never, input);
    recordComplianceAudit(mockEvlogLogger as never, input);

    const calls = mockEvlogLogger.set.mock.calls as unknown as Array<
      [{ audit: { idempotencyKey: string } }]
    >;
    const keys = calls.map(([event]) => event.audit.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("scrubs denial reasons before persistence", () => {
    recordComplianceAudit(
      mockEvlogLogger as never,
      input,
      "Rejected account owner@example.com",
    );

    expect(mockEvlogLogger.audit.deny).toHaveBeenCalledWith(
      "Rejected account [email]",
      expect.objectContaining({ action: "workspace.updated" }),
    );
  });
});

describe("recordStandaloneComplianceAudit", () => {
  let captured: MockAudit;

  beforeEach(() => {
    captured = mockAudit();
  });

  afterEach(() => {
    captured.restore();
  });

  it("records each call as a separate audit event", () => {
    recordStandaloneComplianceAudit(input);
    recordStandaloneComplianceAudit(input);

    expect(captured.events).toHaveLength(2);
    expect(captured.events[0]?.idempotencyKey).not.toBe(
      captured.events[1]?.idempotencyKey,
    );
  });

  it("scrubs reasons before persistence", () => {
    recordStandaloneComplianceAudit({
      ...input,
      reason: "Rejected account owner@example.com",
    });

    expect(captured.assertAudit({ action: input.action }).reason).toBe(
      "Rejected account [email]",
    );
  });
});
