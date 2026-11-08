# Web shell

Keep this Vite/React PWA shell focused on entrypoint, PWA configuration,
instrumentation, and serving. Product UI belongs in `internal/features` or
`internal/workspaces`; providers and route composition belong in `internal/app-shell`.
Read the destination package's `AGENTS.md` before editing there.

Use `@repo/data/http` for non-sync HTTP calls. PowerSync connectors own sync transport.

## Verification

Unit/component tests use Vitest, happy-dom, and Testing Library. E2E specs and
support live in `apps/e2e`; use
[lunaris-dev](../../.agents/skills/lunaris-dev/SKILL.md) for setup and checks.
Cypress reads API logs through `CYPRESS_BACKEND_LOG_PATH`; CI writes `logs/backend.log`.
