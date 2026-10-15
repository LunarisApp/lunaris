# Compliance audit policy

Core recording hooks remain here. Signing, persistence, and review queries live
in `ee/audit/src/server`; Nest adapters live in `apps/api/src/enterprise`.
Review UI lives in `ee/audit/src/client`. The policy below applies to Enterprise
Edition. Community retains recording/redaction hooks and existing audit tables,
but does not persist new signed records or register review endpoints. The shared
table definition lives in `internal/auth/src/audit-entity.ts`.

- Scope: all security-sensitive and mutating API actions in
  `recording/audit.actions.ts`.
- Required fields: stable actor, action, outcome, target, organization tenant, request context.
- Denials and failures are retained alongside successful actions. Audit events are never sampled.
- Primary sink: `audit_events` in PostgreSQL. Rows include the redacted signed envelope for offline HMAC verification; ordinary updates/deletes are blocked by database triggers.
- Retention: seven years. Production operations must export/verify signed records before invoking the restricted retention function.
- Access: only signed-in active-organization owners may query `GET /v1/audit-events`; every review is itself audited. Responses expose curated review fields only, never the raw signed envelope or request context.
- Secrets: `AUDIT_LOG_HMAC_SECRET` is required in production. Rotate annually, set `AUDIT_LOG_HMAC_KEY_ID`, and retain old verification keys for the full retention window.
- Privacy: credential fields use evlog's audit redaction preset, source IPs are subnet-anonymized, and call sites store changed field names rather than document content or request values.
- Review: additions to mutating controllers require an entry in `routeActions` plus success, failure, and denial tests.
