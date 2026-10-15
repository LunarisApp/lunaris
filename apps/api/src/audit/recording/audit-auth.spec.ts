import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type MockAudit, mockAudit } from "evlog";
import { recordAuthAudit } from "./audit-auth";

describe("recordAuthAudit", () => {
  let captured: MockAudit;

  beforeEach(() => {
    captured = mockAudit();
  });

  afterEach(() => {
    captured.restore();
  });

  it("records mapped Better Auth outcomes with organization isolation", () => {
    recordAuthAudit({
      actorId: "user_1",
      outcome: "success",
      path: "/organization/remove-member",
      targetId: "member_1",
      tenantId: "organization_1",
    });

    expect(captured.events).toContainEqual(expect.objectContaining({
      action: "organization-member.removed",
      actor: { id: "user_1", type: "user" },
      context: { tenantId: "organization_1" },
      idempotencyKey: expect.any(String),
      outcome: "success",
      version: 1,
      target: {
        id: "member_1",
        tenantId: "organization_1",
        type: "organizationMember",
      },
    }));
  });

  it("ignores non-critical auth reads", () => {
    recordAuthAudit({
      actorId: "user_1",
      outcome: "success",
      path: "/get-session",
    });
    expect(captured.events).toHaveLength(0);
  });

  it("records denied auth routes outside Nest middleware context", () => {
    recordAuthAudit({
      outcome: "denied",
      path: "/sign-in/email",
      reason: "Invalid credentials",
    });

    expect(captured.toIncludeAuditOf({
      action: "auth.signed-in",
      actor: { id: "anonymous", type: "user" },
      outcome: "denied",
    })).toBe(true);
    expect(captured.assertAudit({
      action: "auth.signed-in",
    }).reason).toBe("Invalid credentials");
  });

  it("records team membership changes against the team and tenant", () => {
    recordAuthAudit({
      actorId: "user_1",
      changedFields: ["organizationId", "teamId", "userId"],
      outcome: "success",
      path: "/organization/add-team-member",
      targetId: "team_1",
      tenantId: "organization_1",
    });

    expect(captured.events).toContainEqual(expect.objectContaining({
      action: "organization-team.member-added",
      actor: { id: "user_1", type: "user" },
      context: { tenantId: "organization_1" },
      outcome: "success",
      target: {
        id: "team_1",
        tenantId: "organization_1",
        type: "organizationTeam",
      },
    }));
  });

  it("records team creation against the organization tenant", () => {
    recordAuthAudit({
      actorId: "user_1",
      outcome: "success",
      path: "/organization/create-team",
      tenantId: "organization_1",
    });

    expect(captured.events).toContainEqual(expect.objectContaining({
      action: "organization-team.created",
      actor: { id: "user_1", type: "user" },
      context: { tenantId: "organization_1" },
      outcome: "success",
      target: {
        id: "organization_1",
        tenantId: "organization_1",
        type: "organization",
      },
    }));
  });
});
