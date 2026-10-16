import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { permission } from "@repo/auth/permissions";
import { mockEvlogLogger } from "../../../../test/preload";
import { PERMISSION_METADATA } from "../../../security/permissions/permission.decorator";
import { AgentAccessGuard, type AgentRequest } from "./agent-access.guard";
import { AGENT_SCOPE_METADATA } from "./agent-principal";

class AgentControlController {
  updateOrganization() {}
}

describe("AgentAccessGuard API keys", () => {
  beforeEach(() => {
    mockEvlogLogger.audit.deny.mockClear();
    mockEvlogLogger.set.mockClear();
  });

  it("creates the scoped synthetic session required by REST controllers", async () => {
    const request = agentRequest("organization_1");
    const guard = apiKeyGuard(["organization_1"]);

    expect(await guard.canActivate(context(request))).toBe(true);
    expect(request.agentPrincipal).toMatchObject({
      actorId: "user_1",
      credentialId: "key_1",
      kind: "apiKey",
    });
    expect(request.session).toMatchObject({
      session: { activeOrganizationId: "organization_1", userId: "user_1" },
      user: { id: "user_1" },
    });
    expect(request.user?.id).toBe("user_1");
  });

  it("rejects an organization outside the key allowlist", async () => {
    const guard = apiKeyGuard(["organization_2"]);

    expect(
      guard.canActivate(context(agentRequest("organization_1")))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns unauthorized for an invalid key", async () => {
    const request = agentRequest("organization_1");
    const guard = apiKeyGuard(["organization_1"], {
      error: { code: "KEY_EXPIRED", message: "API key expired" },
      key: null,
      valid: false,
    });

    expect(guard.canActivate(auditedContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(mockEvlogLogger.audit.deny).toHaveBeenCalledWith(
      "API key expired",
      expect.objectContaining({
        action: "organization.updated",
        actor: { id: "anonymous", type: "user" },
      })
    );
  });

  it("returns forbidden for a valid key without the required scope", async () => {
    const request = agentRequest("organization_1");
    const guard = apiKeyGuard(["organization_1"], {
      error: null,
      key: {
        id: "key_1",
        metadata: {
          scopes: ["workspace:read"],
          organizationIds: ["organization_1"],
        },
        permissions: { agent: ["workspace:read"] },
        referenceId: "user_1",
      },
      valid: true,
    });

    expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(request.auditActor).toEqual({ id: "user_1", type: "api" });
  });

  it("checks permissions after creating the scoped session", async () => {
    const request = agentRequest("organization_1");
    const requirePermission = mock(() => Promise.resolve());
    const guard = apiKeyGuard(["organization_1"], undefined, {
      requiredPermission: permission.content.write,
      requirePermission,
    });

    expect(await guard.canActivate(context(request))).toBe(true);
    expect(requirePermission).toHaveBeenCalledWith(permission.content.write, {
      organizationId: "organization_1",
      userId: "user_1",
    });
  });
});

function apiKeyGuard(
  organizationIds: string[],
  verification: {
    error: null | { code: string; message?: string };
    key: null | {
      id: string;
      metadata?: unknown;
      permissions?: Record<string, string[]> | null;
      referenceId: string;
    };
    valid: boolean;
  } = {
    error: null,
    key: {
      id: "key_1",
      metadata: { scopes: ["organization:read"], organizationIds },
      permissions: { agent: ["organization:read"] },
      referenceId: "user_1",
    },
    valid: true,
  },
  options: {
    requiredPermission?: typeof permission.content.write;
    requirePermission?: ReturnType<typeof mock>;
  } = {}
) {
  const verifyApiKey = mock(async () => verification);
  return new AgentAccessGuard(
    { instance: { api: { verifyApiKey } } } as never,
    { url: "https://api.lunaris.app" } as never,
    { assertAgentEligible: mock(() => Promise.resolve()) } as never,
    {
      getAllAndOverride: (key: string | symbol) => {
        if (key === AGENT_SCOPE_METADATA) {
          return "organization:read";
        }
        if (key === PERMISSION_METADATA) {
          return options.requiredPermission;
        }
      },
    } as never,
    {
      requirePermission:
        options.requirePermission ?? mock(() => Promise.resolve()),
    } as never
  );
}

function agentRequest(organizationId: string) {
  return {
    headers: { "x-lunaris-api-key": "lun_secret" },
    params: { organizationId },
  } as unknown as AgentRequest;
}

function context(request: AgentRequest) {
  return {
    getClass: () => AgentAccessGuard,
    getHandler: () => context,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

function auditedContext(request: AgentRequest) {
  return {
    getClass: () => AgentControlController,
    getHandler: () => AgentControlController.prototype.updateOrganization,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}
