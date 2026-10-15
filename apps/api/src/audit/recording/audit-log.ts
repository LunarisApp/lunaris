import { scrubString } from "@repo/utils";
import {
  type AuditableLogger,
  type AuditFields,
  type AuditInput,
  createLogger,
} from "evlog";

const MAX_AUDIT_REASON_LENGTH = 512;

export function recordComplianceAudit(
  log: AuditableLogger,
  input: AuditInput,
  deniedReason?: string,
): void {
  const reason = sanitizeAuditText(deniedReason ?? input.reason);
  if (deniedReason !== undefined) {
    const {
      outcome: _outcome,
      reason: _inputReason,
      ...deniedInput
    } = input;
    log.audit.deny(reason ?? "Action denied", deniedInput);
  } else {
    log.audit({ ...input, reason });
  }
  log.set({
    audit: { idempotencyKey: crypto.randomUUID() },
  });
}

export function recordStandaloneComplianceAudit(
  input: AuditInput,
  context?: AuditFields["context"],
): void {
  const log = createLogger();
  recordComplianceAudit(log, input);
  if (context) log.set({ audit: { context } });
  log.emit();
}

export function sanitizeAuditText(value: string | undefined) {
  return value
    ? scrubString(value).slice(0, MAX_AUDIT_REASON_LENGTH)
    : undefined;
}
