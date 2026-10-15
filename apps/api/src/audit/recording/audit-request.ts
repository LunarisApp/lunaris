import type { ExecutionContext } from "@nestjs/common";
import type { AuditActor, AuditInput } from "evlog";
import type { FastifyRequest } from "fastify";
import type { AgentPrincipal } from "../../agents/control/access/agent-principal";
import { type AuditActionName, AuditActions } from "./audit.actions";

type AuditRequest = FastifyRequest & {
  agentPrincipal?: AgentPrincipal;
  auditActor?: AuditActor;
  body?: unknown;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  session?: {
    session?: { activeOrganizationId?: string | null };
    user?: { id?: string | null };
  };
  user?: { id?: string | null } | null;
};

const TARGET_ID_KEYS = [
  "memberId",
  "fileId",
  "attachmentId",
  "storageId",
  "resourceId",
  "workspaceId",
  "organizationId",
  "organizationId",
  "id",
] as const;

const TARGET_PARAM_BY_ACTION: Partial<
  Record<AuditActionName, (typeof TARGET_ID_KEYS)[number]>
> = {
  backupDownloadUrlIssued: "id",
  workspaceStorageRead: "storageId",
  fileDeleted: "fileId",
  fileDownloadUrlIssued: "fileId",
  workspaceDeleted: "workspaceId",
  workspaceResourceDeleted: "resourceId",
  workspaceResourceTrashed: "resourceId",
  workspaceResourceRestored: "resourceId",
  workspaceResourcePurged: "resourceId",
  workspaceResourceUpdated: "resourceId",
  workspaceUpdated: "workspaceId",
  organizationMemberRemoved: "memberId",
  organizationMemberRoleUpdated: "memberId",
  organizationUpdated: "organizationId",
};

export function auditInputForRequest(
  context: ExecutionContext,
  actionName: AuditActionName,
  outcome: AuditInput["outcome"],
  reason?: string,
  result?: unknown,
): AuditInput {
  const request = context.switchToHttp().getRequest<AuditRequest>();
  const action = AuditActions[actionName];
  const tenantId = getTenantId(request);
  const actor = getActor(request, result);
  const targetId =
    semanticTargetId(actionName, request.params) ??
    resultId(result) ??
    findTargetId(request.params) ??
    findTargetId(
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : undefined,
    ) ??
    (action.target === "user" || action.target === "account"
      ? actor.id
      : undefined) ??
    tenantId ??
    request.url;

  return action({
    actor,
    changes: changedFields(request.body),
    outcome,
    reason,
    target: {
      id: targetId,
      ...(tenantId ? { tenantId } : {}),
      ...targetReferences(request.params),
      ...targetDetails(actionName, request.body),
    },
  });
}

function semanticTargetId(
  actionName: AuditActionName,
  params: Record<string, unknown> | undefined,
): string | undefined {
  const targetKey = TARGET_PARAM_BY_ACTION[actionName];
  return targetKey ? stringValue(params?.[targetKey]) : undefined;
}

function targetDetails(
  actionName: AuditActionName,
  body: unknown,
): Record<string, unknown> {
  if (actionName !== "syncIngested") return {};
  if (!body || typeof body !== "object" || !("transactions" in body)) {
    return { mutations: [] };
  }
  const transactions = Array.isArray(body.transactions)
    ? body.transactions
    : [];
  const mutations = transactions.flatMap((transaction) => {
    if (
      !transaction ||
      typeof transaction !== "object" ||
      !("crud" in transaction) ||
      !Array.isArray(transaction.crud)
    ) {
      return [];
    }
    return transaction.crud.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const id = "id" in entry ? stringValue(entry.id) : undefined;
      const op = "op" in entry ? stringValue(entry.op) : undefined;
      const type = "type" in entry ? stringValue(entry.type) : undefined;
      return id && op && type ? [{ id, op, type }] : [];
    });
  });
  return { mutations };
}

function resultId(result: unknown): string | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  if ("id" in result) return stringValue(result.id);
  if (
    "user" in result &&
    result.user &&
    typeof result.user === "object" &&
    "id" in result.user
  ) {
    return stringValue(result.user.id);
  }
  return undefined;
}

function resultUserId(result: unknown): string | undefined {
  if (
    !result ||
    typeof result !== "object" ||
    !("user" in result) ||
    !result.user ||
    typeof result.user !== "object" ||
    !("id" in result.user)
  ) {
    return undefined;
  }
  return stringValue(result.user.id);
}

export function getTenantId(request: AuditRequest): string | undefined {
  const params = request.params;
  const parameterId = stringValue(params?.organizationId);
  if (parameterId) return parameterId;
  if (request.body && typeof request.body === "object") {
    const body = request.body as Record<string, unknown>;
    const bodyId = stringValue(body.organizationId);
    if (bodyId) return bodyId;
  }
  return stringValue(request.session?.session?.activeOrganizationId);
}

function getActor(request: AuditRequest, result?: unknown): AuditActor {
  if (request.auditActor) return request.auditActor;
  const principal = request.agentPrincipal;
  if (principal) {
    return {
      id: principal.actorId,
      type: principal.kind === "session" ? "user" : "api",
    };
  }
  const userId =
    stringValue(request.user?.id) ??
    stringValue(request.session?.user?.id) ??
    resultUserId(result);
  return userId
    ? { id: userId, type: "user" }
    : { id: "anonymous", type: "user" };
}

function changedFields(body: unknown): AuditInput["changes"] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const fields = Object.keys(body).sort();
  return fields.length ? { after: { fields } } : undefined;
}

function findTargetId(
  params: Record<string, unknown> | undefined,
): string | undefined {
  for (const key of TARGET_ID_KEYS) {
    const value = stringValue(params?.[key]);
    if (value) return value;
  }
  return undefined;
}

function targetReferences(
  params: Record<string, unknown> | undefined,
): Record<string, string> {
  const references: Record<string, string> = {};
  for (const key of TARGET_ID_KEYS) {
    const value = stringValue(params?.[key]);
    if (value) references[key] = value;
  }
  return references;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
