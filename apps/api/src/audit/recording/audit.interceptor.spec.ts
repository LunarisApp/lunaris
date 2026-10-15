import { beforeEach, describe, expect, it } from "bun:test";
import {
  type CallHandler,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { firstValueFrom, of, throwError } from "rxjs";
import { mockEvlogLogger } from "../../../test/preload";
import { ComplianceAuditInterceptor } from "./audit.interceptor";

class WorkspacesController {
  create() {}
}

function context(): ExecutionContext {
  return {
    getClass: () => WorkspacesController,
    getHandler: () => WorkspacesController.prototype.create,
    getType: () => "http",
    switchToHttp: () => ({
      getNext: () => undefined,
      getResponse: () => ({}),
      getRequest: () => ({
        body: { name: "Private title" },
        method: "POST",
        params: {},
        session: {
          session: { activeOrganizationId: "organization_1" },
          user: { id: "user_1" },
        },
        url: "/v1/workspaces",
        user: { id: "user_1" },
      }),
    }),
  } as unknown as ExecutionContext;
}

const reflector = {
  get: () => undefined,
};

describe("ComplianceAuditInterceptor", () => {
  beforeEach(() => {
    mockEvlogLogger.audit.mockClear();
    mockEvlogLogger.audit.deny.mockClear();
    mockEvlogLogger.set.mockClear();
  });

  it("records successful critical actions without request values", async () => {
    const interceptor = new ComplianceAuditInterceptor(reflector as never);
    await firstValueFrom(
      interceptor.intercept(context(), {
        handle: () => of({ id: "workspace_1" }),
      } as CallHandler),
    );

    expect(mockEvlogLogger.audit).toHaveBeenCalledWith({
      action: "workspace.created",
      actor: { id: "user_1", type: "user" },
      changes: { after: { fields: ["name"] } },
      outcome: "success",
      reason: undefined,
      target: {
        id: "workspace_1",
        tenantId: "organization_1",
        type: "workspace",
      },
    });
    expect(mockEvlogLogger.set).toHaveBeenCalledWith({
      audit: { idempotencyKey: expect.any(String) },
    });
  });

  it("records authorization denials", async () => {
    const interceptor = new ComplianceAuditInterceptor(reflector as never);
    const failure = new ForbiddenException("Organization membership required");

    await expect(
      firstValueFrom(
        interceptor.intercept(context(), {
          handle: () => throwError(() => failure),
        } as CallHandler),
      ),
    ).rejects.toBe(failure);

    expect(mockEvlogLogger.audit.deny).toHaveBeenCalledWith(
      "Organization membership required",
      expect.objectContaining({
        action: "workspace.created",
        actor: { id: "user_1", type: "user" },
      }),
    );
  });
});
