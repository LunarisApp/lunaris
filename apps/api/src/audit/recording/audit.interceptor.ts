import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { useLogger } from "evlog/nestjs";
import { catchError, tap, throwError } from "rxjs";
import {
  type AuditActionName,
  routeAuditAction,
} from "./audit.actions";
import { AUDIT_ACTION_METADATA } from "./audit.decorator";
import { recordComplianceAudit } from "./audit-log";
import { auditInputForRequest } from "./audit-request";

@Injectable()
export class ComplianceAuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const action = this.resolveAction(context);
    if (!action) return next.handle();

    const log = useLogger();
    return next.handle().pipe(
      tap((result) => {
        recordComplianceAudit(
          log,
          auditInputForRequest(
            context,
            action,
            "success",
            undefined,
            result,
          ),
        );
      }),
      catchError((error: unknown) => {
        const status = statusOf(error);
        const outcome =
          status === 401 || status === 403 ? "denied" : "failure";
        const reason = error instanceof Error ? error.message : "Action failed";
        if (outcome === "denied") {
          const input = auditInputForRequest(context, action, "denied");
          recordComplianceAudit(log, input, reason);
        } else {
          recordComplianceAudit(
            log,
            auditInputForRequest(context, action, outcome, reason),
          );
        }
        return throwError(() => error);
      }),
    );
  }

  private resolveAction(context: ExecutionContext): AuditActionName | undefined {
    return (
      this.reflector.get<AuditActionName>(
        AUDIT_ACTION_METADATA,
        context.getHandler(),
      ) ??
      routeAuditAction(
        context.getClass().name,
        context.getHandler().name,
      )
    );
  }
}

function statusOf(error: unknown): number | undefined {
  if (error instanceof HttpException) return error.getStatus();
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
}
