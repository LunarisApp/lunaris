# Enterprise Edition

Enterprise feature implementations live under `ee/`, with a separate proprietary
[license](LICENSE), held by Roman Sirokov (<roman@lunaris.app>). The root
MIT license excludes this directory. There is no subscription/license
enforcement; that does not grant permission to use or distribute EE.

## Packages

- `@repo/ee-audit`: audit signing, persistence, tenant-filtered review queries,
  and audit review UI.
- `@repo/ee-teams`: Better Auth team enablement, teams UI, and team assignment
  during invitations.
- `@repo/ee-composition`: enterprise organization provider and edition entry point.

Each feature owns `src/server` and `src/client`, with colocated tests. Explicit
`/server` and `/client` exports keep runtime imports separate; there is no mixed
root export. Client and server have separate TypeScript configurations. Bun runs
server tests; Vitest runs client tests. Each client entry imports its own Tailwind
source stylesheet. Composition imports feature client exports and wires sections
into core's organization provider.

## Composition

Enterprise web and desktop entry points wrap the application in
`EnterpriseOrganizationProvider`. Core organization settings expose optional
sections; without a provider they offer ordinary members/invitations and omit
teams/audit navigation and direct-tab access. EE depends on core packages;
core libraries do not import EE.

The API composes audit adapters under `apps/api/src/enterprise`. These adapt its
Nest controllers, database, membership lookup, pagination, and log lifecycle to
`@repo/ee-audit/server`. Auth composition passes `enterpriseTeams` from `@repo/ee-teams/server` explicitly. The shared
auth server defaults teams off when that option is absent. The shared auth client
retains team method types for compatibility; the server controls endpoint access.

## Build selection

`LUNARIS_EDITION` accepts `community` (default) or `enterprise`. Other values fail.
Set the same edition for API, web, and desktop builds or development:

```sh
LUNARIS_EDITION=enterprise bun run build --filter=api --filter=web --filter=desktop
LUNARIS_EDITION=enterprise bun run dev
```

Community builds omit team endpoints, audit review/signing services, and their UI.
The self-hosted Community Edition API image excludes `ee/` and its workspace
dependencies; building still uses the complete checkout. Enterprise builds include
the EE license.
Changing a running container's environment cannot enable omitted code: rebuild.
Commercial license validation is not implemented; the license still applies.
Railway configurations explicitly select enterprise to preserve hosted features.

## Data and audit safety

Existing SQL migrations, team tables/relations, SQLite schemas, sync rules, and
legacy invitation/session fields remain intact. They preserve stored data and
existing installs. Do not rewrite historical migrations or drop enterprise data
when disabling a feature. The audit entity lives in `internal/auth` and is re-exported by both the API
schema composition and EE so Drizzle continues to discover the same table.

Core retains event recording, action contracts, redaction, denial logging, and
permission checks. EE retains HMAC signing, idempotent writes, owner-only review,
tenant filters, and curated responses. Existing append-only and seven-year
retention database protections remain unchanged.

Team CRUD is implemented by the third-party Better Auth organization plugin;
EE owns Lunaris's opt-in and user interfaces, not the upstream plugin's license.

## Checks

```sh
bun run typecheck --filter=@repo/ee-audit --filter=@repo/ee-teams --filter=@repo/ee-composition
bun run --cwd ee/audit test
bun run --cwd ee/teams test
cd apps/api && bun test src/enterprise libs/db/src/db.module.spec.ts
```
