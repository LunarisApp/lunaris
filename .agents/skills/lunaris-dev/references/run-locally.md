# Run locally

## Resolve the environment

Use the Bun version and scripts in root `package.json`, plus a running Docker
installation. Read `infra/local/compose.yaml` for service ports and dependencies.
Committed app defaults are `apps/api/.env.development` and
`apps/web/.env.development`; keep personal overrides in gitignored `.env.local`.
Use existing credentials and report missing values instead of inventing secrets.

Check existing app processes and Compose services before starting more. Default
app health probes are:

```sh
curl -sf http://localhost:5173 >/dev/null
curl -sf http://localhost:3000/v1/health >/dev/null
docker compose --env-file apps/api/${LUNARIS_COMPOSE_ENV:-.env.development} -f infra/local/compose.yaml ps
```

For custom ports, adjust probes to match the running configuration.

## Start missing components

Run only the missing steps, in order:

```sh
bun install
bun run services:up
bun run services:init
NODE_ENV=development bun run --filter=api db:migrate
bun run dev
```

`services:init` bootstraps Garage buckets idempotently. Apply migrations before
starting API. Keep dev servers in a persistent terminal. Setup is complete when
required Compose services are healthy and both app probes pass.

For an alternate environment, keep Compose and migration settings aligned:

```sh
LUNARIS_COMPOSE_ENV=.env.e2e bun run services:up
LUNARIS_COMPOSE_ENV=.env.e2e bun run services:init
bun --env-file=apps/api/.env.e2e run --filter=api db:migrate
```

Compose env filenames resolve under `apps/api`. Start apps with the same intended
API/database configuration; inspect app env loading before mixing environments.

## Troubleshoot

- Read `bun run services:logs`; inspect Redis separately with Compose logs when needed.
- If PowerSync cannot reach a late-started API, inspect its logs, then restart `powersync` with the same Compose env file.
- For port conflicts, identify the listener before stopping it. PostgreSQL's published port is `POSTGRES_HOST_PORT`; align the API's `DATABASE_PORT` with it. Compose overrides must reach its selected env file or shell environment.
- For alternate app ports, set API `PORT`, web `PORT`, and web `VITE_API_EU_URL` consistently.
- Reset persistent local data only when explicitly requested: `bun run services:down -- -v`, then repeat startup, bucket initialization, and migrations.

If startup fails, report the failing command and decisive error. Continue diagnosis
from that component's logs rather than repeating the full setup sequence.
