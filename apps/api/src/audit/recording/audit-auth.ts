import { createLogger } from "evlog";
import {
  AuditActions,
  authRouteAuditAction,
} from "./audit.actions";
import { recordComplianceAudit } from "./audit-log";

export interface AuthAuditEvent {
  actorId?: string;
  changedFields?: string[];
  outcome: "success" | "failure" | "denied";
  path: string;
  reason?: string;
  targetId?: string;
  tenantId?: string;
}

export function recordAuthAudit(event: AuthAuditEvent): void {
  const path = event.path;
  const actionName = authRouteAuditAction(`/api/auth${path}`);
  if (!actionName) return;
  const action = AuditActions[actionName];

  const log = createLogger({
    path: `/api/auth${path}`,
    ...(event.actorId ? { user: { id: event.actorId } } : {}),
    ...(event.tenantId
      ? { organization: { id: event.tenantId } }
      : {}),
  });
  const input = action({
    actor: {
      id: event.actorId ?? "anonymous",
      type: "user",
    },
    changes: event.changedFields
      ? { after: { fields: event.changedFields } }
      : undefined,
    outcome: event.outcome,
    reason: event.reason,
    target: {
      id:
        event.targetId ??
        (action.target === "organization" ? event.tenantId : undefined) ??
        event.actorId ??
        event.tenantId ??
        path,
      ...(event.tenantId ? { tenantId: event.tenantId } : {}),
    },
  });
  if (event.outcome === "denied") {
    recordComplianceAudit(
      log,
      input,
      event.reason ?? "Auth action denied",
    );
  } else {
    recordComplianceAudit(log, input);
  }
  if (event.tenantId) {
    log.set({
      audit: { context: { tenantId: event.tenantId } },
    });
  }
  log.emit();
}
