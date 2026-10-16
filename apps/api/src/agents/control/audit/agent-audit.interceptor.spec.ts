import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of, throwError } from "rxjs";
import { mockEvlogLogger } from "../../../../test/preload";
import { AgentAuditInterceptor } from "./agent-audit.interceptor";

function context(
  request: Record<string, unknown>,
  handlerName = "createWorkspace"
) {
  return {
    getHandler: () => ({ [handlerName]: () => undefined })[handlerName],
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("AgentAuditInterceptor", () => {
  const audit = mock(() => Promise.resolve());
  const interceptor = new AgentAuditInterceptor({ audit } as never);

  beforeEach(() => {
    audit.mockReset();
    audit.mockResolvedValue(undefined);
    mockEvlogLogger.set.mockClear();
    mockEvlogLogger.error.mockClear();
  });

  it("records successful API-key operations with scoped target metadata", async () => {
    const request = {
      agentPrincipal: {
        actorId: "user-1",
        credentialId: "key-1",
        kind: "apiKey",
      },
      id: "request-1",
      params: { workspaceId: "workspace-1", organizationId: "organization-1" },
    };

    await expect(
      firstValueFrom(
        interceptor.intercept(context(request), {
          handle: () => of({ id: "workspace-1" }),
        } as CallHandler)
      )
    ).resolves.toEqual({ id: "workspace-1" });

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "user-1",
        clientId: "key-1",
        operation: "create_workspace",
        requestId: "request-1",
        status: "success",
        targetId: "workspace-1",
        organizationId: "organization-1",
      })
    );
    expect(mockEvlogLogger.set).toHaveBeenCalledWith({
      agent: { kind: "apiKey", operation: "create_workspace" },
      user: { id: "user-1" },
    });
  });

  it("records failures and rethrows the original error", async () => {
    const failure = Object.assign(new Error("denied"), { code: "FORBIDDEN" });
    const request = {
      agentPrincipal: {
        actorId: "user-1",
        clientId: "client-1",
        kind: "oauth",
      },
      id: "request-2",
      params: { memberId: "member-1" },
    };

    await expect(
      firstValueFrom(
        interceptor.intercept(context(request, "removeMember"), {
          handle: () => throwError(() => failure),
        } as CallHandler)
      )
    ).rejects.toBe(failure);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-1",
        errorCode: "FORBIDDEN",
        operation: "remove_organization_member",
        status: "failure",
        targetId: "member-1",
      })
    );
  });

  it("does not audit requests without a verified principal", async () => {
    await firstValueFrom(
      interceptor.intercept(context({ id: "request-3", params: {} }), {
        handle: () => of("ok"),
      } as CallHandler)
    );

    expect(audit).not.toHaveBeenCalled();
    expect(mockEvlogLogger.set).not.toHaveBeenCalled();
  });

  it("contains audit write failures without changing handler results", async () => {
    audit.mockRejectedValueOnce(new Error("database unavailable"));
    const request = {
      agentPrincipal: { actorId: "user-1", kind: "local" },
      id: "request-4",
      params: { resourceId: "resource-1" },
    };

    await expect(
      firstValueFrom(
        interceptor.intercept(context(request, "updateResource"), {
          handle: () => of("saved"),
        } as CallHandler)
      )
    ).resolves.toBe("saved");
    expect(mockEvlogLogger.error).toHaveBeenCalledWith(expect.any(Error), {
      agentAudit: {
        operation: "update_resource",
        status: "success",
        write: "failed",
      },
    });
  });
});
