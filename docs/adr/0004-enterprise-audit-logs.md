# 0004: Keep a dedicated enterprise audit trail

- Status: Accepted
- Date: 2026-10-14

## Context

Enterprise customers need to know who performed a sensitive action, what it
affected, when it happened, and whether it succeeded. This supports security
investigations, access reviews, and compliance evidence. Failed and denied
attempts matter too.

Diagnostic logs can change format, be sampled, or expire quickly. Resource
history tracks content edits, not authentication, administration, or permissions.
Neither provides the audit trail we need.

## Decision

Record security-sensitive and mutating API actions in a dedicated audit trail.
Keep action definitions and recording hooks in core. Enterprise Edition supplies
signed storage and review, as described in [ADR 0005](0005-open-core-enterprise-boundary.md).

### Record actions and outcomes

Use the shared action catalog and evlog audit APIs to capture actor, action,
target, time, outcome, and relevant organization and request context. Record
successes, failures, and denials without sampling.

Controllers, authentication hooks, permission checks, and services record events
at the appropriate point. New mutating actions need action mappings and tests
for success, failure, and denial; new endpoints are not covered automatically.

This is a server audit trail. It covers received and processed actions, not
local-only activity, unsynced edits, or every keystroke.

### Sign and store records

An audit-specific evlog drain signs redacted events with HMAC and writes them to
PostgreSQL's `audit_events` table. Store the event, signature, and key identifier
for later verification. A unique event key prevents duplicate inserts when the
same event is delivered again.

Database triggers block ordinary updates and deletes. Signatures help detect
changed data, but do not prove completeness or prevent forgery by someone holding
the signing key. Privileged database operators can bypass database protections.

Audit delivery runs separately from diagnostic delivery. It reports write failures
and waits for pending writes during graceful shutdown. Business changes and audit
writes use separate transactions, so crashes can leave gaps. A transactional
outbox or another stronger delivery design would need a further decision.

### Protect privacy and review access

Record changed field names instead of resource content or full request values.
Redact credentials, sanitize reasons and user agents, and reduce IP precision
to subnet level.

Only signed-in owners can review events for their active organization. The server
filters by organization and audits each review. The endpoint returns selected
review fields, excluding the raw signed event and full request context.

### Retain records and verification keys

Keep the current seven-year retention policy for long-term enterprise review.
This is a product policy, not a universal compliance requirement. Other retention
needs require a policy and implementation review.

The restricted purge function rejects cutoffs newer than seven years. Operators
must export and verify records before purging. Require a production signing
secret, identify keys, rotate them annually, and keep old verification keys for
the retention window. Detailed steps belong in maintenance procedures.

Community builds keep recording and redaction hooks, permission checks, existing
schemas, and data. They do not write new signed compliance records or expose audit
review endpoints.

## Alternatives considered

- **Diagnostic logs alone:** leave evidence dependent on operational log policies.
- **Resource history:** misses authentication, administration, and denied actions.
- **Unsigned, mutable rows:** offer weaker integrity checks.
- **Full request payloads:** retain unnecessary private content and secrets.
- **External audit service:** can offer independent retention and isolation, but
  adds a deployment dependency. PostgreSQL keeps storage built in.

## Consequences

Enterprise owners gain consistent evidence for investigations and reviews, with
integrity checks and controlled disclosure. Audit records support compliance
work; they do not certify a deployment or establish compliance by themselves.

Long retention and unsampled events cost storage. Keys need secure custody, and
every sensitive action needs coverage. Limited payloads reduce forensic detail.
The separate write path leaves a crash-related delivery gap; stricter delivery,
archival, or retention needs require more work.

## References

- [Audit policy](../../apps/api/src/audit/README.md)
- [Action catalog](../../apps/api/src/audit/recording/audit.actions.ts)
- [Privacy helpers](../../apps/api/src/audit/recording/audit-privacy.ts)
- [Audit signing, persistence, and queries](../../ee/audit/src/server/audit.service.ts)
- [Log delivery and shutdown](../../apps/api/src/instrument.ts)
- [Audit review endpoint](../../apps/api/src/enterprise/audit.controller.ts)
- [Append-only and retention migration](../../apps/api/drizzle/0031_nifty_krista_starr.sql)
- [Enterprise composition](../../ee/README.md)
