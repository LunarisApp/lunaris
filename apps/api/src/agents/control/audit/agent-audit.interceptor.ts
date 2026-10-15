import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { useLogger } from "evlog/nestjs";
import { catchError, concatMap, from, type Observable, throwError } from "rxjs";
import type { AgentRequest } from "../access/agent-access.guard";
import { agentOperationId } from "../access/agent-principal";
import { agentErrorCode, asError } from "../safety/agent-error.utils";
import { AgentSafetyService } from "../safety/agent-safety.service";

@Injectable()
export class AgentAuditInterceptor implements NestInterceptor {
  constructor(private readonly safety: AgentSafetyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = performance.now();
    const request = context.switchToHttp().getRequest<AgentRequest>();
    const operation = agentOperationId(context.getHandler().name);
    if (request.agentPrincipal) {
      useLogger().set({
        agent: { kind: request.agentPrincipal.kind, operation },
        user: { id: request.agentPrincipal.actorId },
      });
    }

    return next.handle().pipe(
      concatMap((value) =>
        from(
          this.writeAuditSafely(request, operation, startedAt, "success").then(
            () => value,
          ),
        ),
      ),
      catchError((error: unknown) =>
        from(
          this.writeAuditSafely(
            request,
            operation,
            startedAt,
            "failure",
            error,
          ).then(() => error),
        ).pipe(concatMap((caught) => throwError(() => caught))),
      ),
    );
  }

  private async writeAuditSafely(
    request: AgentRequest,
    operation: string,
    startedAt: number,
    status: "failure" | "success",
    error?: unknown,
  ) {
    try {
      await this.writeAudit(request, operation, startedAt, status, error);
    } catch (cause) {
      useLogger().error(asError(cause, "Agent audit write failed"), {
        agentAudit: { operation, status, write: "failed" },
      });
    }
  }

  private writeAudit(
    request: AgentRequest,
    operation: string,
    startedAt: number,
    status: "failure" | "success",
    error?: unknown,
  ) {
    const principal = request.agentPrincipal;
    if (!principal) return Promise.resolve();
    const params = request.params as {
      resourceId?: string;
      memberId?: string;
      workspaceId?: string;
      organizationId?: string;
    };
    return this.safety.audit({
      actorId: principal.actorId,
      clientId:
        principal.kind === "apiKey"
          ? principal.credentialId
          : principal.kind === "oauth"
            ? principal.clientId
            : undefined,
      durationMs: Math.round(performance.now() - startedAt),
      errorCode: status === "failure" ? agentErrorCode(error) : undefined,
      operation,
      requestId: request.id,
      status,
      targetId: params.resourceId ?? params.workspaceId ?? params.memberId,
      organizationId: params.organizationId,
    });
  }
}
