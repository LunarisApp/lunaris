# Web application

Thin Vite/React composition shell for the Lunaris PWA.

## Boundaries

- `apps/web`: entrypoint, PWA, instrumentation, deployment.
- `internal/app-shell`: global providers, gates, tool registry, and route composition.
- `internal/workspaces`: workspace routes, workbench, and extension host.
- `internal/data`: PowerSync SQLite schema, sync, persistence.
- `internal/features`: product feature modules and locale strings.
- `internal/platform`: platform abstractions.
- `packages/plugin-sdk`: public extension contract.
- `packages/ui`: public shared UI.
- `extensions/*`: isolated bundled extension implementations.
- `apps/e2e`: Cypress config, support, and specs.

Use `@repo/data/http` for non-sync HTTP calls. PowerSync connectors own sync
transport.

## Tests

Run unit/component tests with `bun run test` from the relevant workspace or
repository root. Tests use Vitest, happy-dom, and Testing Library.

E2E lives in `apps/e2e`. Run the API, web app, and local services, then:

```sh
bun run e2e
bun run e2e:open
```

The Cypress tasks read API logs through `CYPRESS_BACKEND_LOG_PATH`. CI writes
that log to `logs/backend.log`.
