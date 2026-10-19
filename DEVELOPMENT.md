# Local development

- Bun 1.4.0, matching the repository's `packageManager` field
- Docker Desktop
- macOS or Linux for local application development
- The pinned Rust toolchain for the desktop app or CLI

From the repository root:

```sh
bun install
bun run services:up
bun run services:init
NODE_ENV=development bun run --filter=api db:migrate
bun run dev
```

Open [localhost:5173](http://localhost:5173). The API runs on port `3000`;
local services use `5432` (PostgreSQL), `8080` (PowerSync), and `3900`/`3903`
(Garage).

Development defaults are committed in `apps/api/.env.development` and
`apps/web/.env.development`. Use gitignored `.env.local` files for personal
overrides. Set `LUNARIS_COMPOSE_ENV` to select a different API env file for Compose.

## Useful commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the API and web app |
| `bun run dev:desktop` | Start the Tauri desktop app |
| `bun run dev:docs` | Start the documentation site |
| `bun run dev:landing` | Start the marketing site |
| `bun run services:logs` | View local service logs |
| `bun run services:down` | Stop local services |
| `bun run build` | Build applications and public packages |
| `bun run check` | Run Biome checks |
| `bun run typecheck` | Typecheck workspaces |
| `bun run test` | Run workspace unit tests |
| `cargo test --workspace` | Run Rust workspace tests |
| `bun run e2e` | Run Cypress end-to-end tests |
| `bun run public:validate` | Validate public package builds, types, and fixtures |
| `bun run release:validate` | Check CLI and desktop version synchronization |

## Repository map

App setup: [API](apps/api/README.md), [web](apps/web/README.md),
[desktop](apps/desktop/README.md), [CLI](apps/cli/README.md),
[docs](apps/docs/README.md), [website](apps/landing/README.md),
[E2E tests](apps/e2e/README.md).

```text
apps/               Applications and browser tests
packages/           Public plugin SDK and UI components
internal/           Internal application libraries (@repo/*)
ee/                 Proprietary enterprise features
extensions/         Bundled extensions
crates/agent-mcp/   Shared Rust MCP runtime
infra/              Local services and self-hosting infrastructure
assets/brand/       Brand assets
tooling/            Repository and release tooling
```

Lunaris uses TypeScript and Rust, Bun workspaces, and Turborepo. PowerSync handles
client data sync; Yjs powers collaborative editing. Only `@lunarisapp/plugin-sdk`
and `@lunarisapp/ui` are publishable packages. Cargo uses the root workspace and
lockfile.
