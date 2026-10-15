import { SetMetadata } from "@nestjs/common";
import type { AuditActionName } from "./audit.actions";

export const AUDIT_ACTION_METADATA = Symbol("audit-action");

export const Audited = (action: AuditActionName): MethodDecorator =>
  SetMetadata(AUDIT_ACTION_METADATA, action);
