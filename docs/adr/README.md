# Architecture Decision Records

ADRs capture significant architecture decisions, their context, and consequences.

Use this folder to explain why Lunaris works the way it does: decisions about
storage, sync, collaboration, extension contracts, or application boundaries.
Write for contributors who need to understand or revisit a decision later.

Create an ADR when a decision has lasting consequences or meaningful tradeoffs.
Keep routine implementation details in code and task instructions in
[maintenance procedures](../procedures/README.md).

## Records

1. [Resources](0001-resources.md)
2. [Offline-first](0002-offline-first.md)
3. [Extensible workspace platform](0003-extensible-workspace-platform.md)
4. [Enterprise audit logs](0004-enterprise-audit-logs.md)
5. [Open-core enterprise boundary](0005-open-core-enterprise-boundary.md)
6. [Regions and server discovery](0006-regions-and-server-discovery.md)
7. [Railway production infrastructure](0007-railway-production-infrastructure.md)

## Conventions

- Name files `NNNN-short-decision-title.md`, starting with `0001`.
- Use the next available number and a descriptive, kebab-case title.
- Start with status `Proposed`; change it to `Accepted` when agreed or `Rejected`
  when declined.
- Preserve accepted decisions as history. When replacing one, create a new ADR
  and mark the old one `Superseded by [ADR NNNN](NNNN-title.md)`.
- Link relevant code, issues, procedures, and related ADRs using repository-relative
  links where possible.

## Template

Copy this into a new file and replace the placeholders. Record actual reasoning,
including drawbacks and alternatives considered.

```markdown
# NNNN: <Decision title>

- Status: Proposed
- Date: YYYY-MM-DD

## Context

<What problem needs a decision? What requirements and constraints matter?>

## Decision

<What will we do, and why does it fit these constraints?>

## Alternatives considered

- <Alternative>: <Why it was not selected.>

## Consequences

- Benefits: <What improves.>
- Costs and risks: <Tradeoffs, limitations, and ongoing obligations.>

## References

- <Links to supporting code, discussions, procedures, or related ADRs.>
```
