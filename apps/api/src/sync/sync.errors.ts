import { AuthorizationError, BadRequestError } from "@app/utils/errors";
import { log } from "evlog";

export class NoActiveOrganizationError extends BadRequestError {
  constructor() {
    super({
      message: "No active organization",
      why: "Session has no activeOrganizationId",
      reason: "entitlements.no_active_organization",
    });
    this.name = "NoActiveOrganizationError";
  }
}

export type LocalOnlySyncAccessReason = "anonymous";

export class LocalOnlySyncAccessError extends AuthorizationError {
  constructor(_reason: LocalOnlySyncAccessReason) {
    super({
      message: "Cloud sync is disabled for this session",
      why: "Anonymous sessions cannot use cloud sync",
      reason: "entitlements.local_only_anonymous",
    });
    this.name = "LocalOnlySyncAccessError";
  }
}

export class UnknownTableError extends BadRequestError {
  constructor(tableName: string) {
    super({
      message: `Unknown table: ${tableName}`,
      why: `No handler registered for table "${tableName}"`,
      reason: "sync.unknown_table",
    });
    this.name = "UnknownTableError";
  }
}

/**
 * 403 — caller does not own the entity. UUIDs are deliberately omitted from
 * `why` so we don't confirm entity existence to unauthorized callers; IDs are
 * logged to evlog context for ops debugging instead.
 */
export class OrganizationMismatchError extends AuthorizationError {
  constructor(entityType: string, entityId: string, organizationId: string) {
    log.warn({
      context: "OrganizationMismatchError",
      message: "Cross-org entity access blocked",
      args: [{ entityType, entityId, organizationId }],
    });
    super({
      message: `${entityType} does not belong to organization`,
      why: `${entityType} does not belong to current organization`,
      reason: "entitlements.organization_mismatch",
    });
    this.name = "OrganizationMismatchError";
  }
}

export class ImmutableOperationError extends AuthorizationError {
  constructor(table: string, op: string) {
    super({
      message: `${table} cannot be ${op.toLowerCase()}ed`,
      why: `${op} operation is not allowed on ${table}`,
      reason: "sync.immutable_operation",
    });
    this.name = "ImmutableOperationError";
  }
}

export class InvalidParentError extends BadRequestError {
  constructor(resourceId: string, parentId: string, why: string) {
    super({
      message: "Invalid workspace resource parent",
      why: `Cannot attach resource ${resourceId} to parent ${parentId}: ${why}`,
      reason: "sync.invalid_parent",
    });
    this.name = "InvalidParentError";
  }
}
