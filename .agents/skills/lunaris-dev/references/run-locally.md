# Run locally

Use the Bun version in root `package.json` and a running Docker installation.
Committed defaults live in `apps/api/.env.development` and `apps/web/.env.development`.
Keep personal overrides in gitignored `.env.local` files. Never invent secrets.

## Start

Check existing processes and services before starting more:

```sh
curl -sf http://localhost:5173 >/dev/null
curl -sf http://localhost:3000/v1/health >/dev/null
docker compose --env-file apps/api/${LUNARIS_COMPOSE_ENV:-.env.development} -f infra/local/compose.yaml ps
```

Run only the missing setup steps, in order:

```sh
bun install
bun run services:up
bun run services:init
NODE_ENV=development bun run --filter=api db:migrate
bun run dev
```

`services:init` bootstraps Garage buckets idempotently. Apply migrations before API startup.
Keep dev servers in a persistent terminal; recheck health after startup.

For an alternate Compose environment, filenames resolve under `apps/api`:

```sh
LUNARIS_COMPOSE_ENV=.env.e2e bun run services:up
bun --env-file=apps/api/.env.e2e run --filter=api db:migrate
```

## Ports

| Service | Default port |
| --- | --- |
| Web | 5173 |
| API | 3000 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| PowerSync | 8080 |
| Garage S3 / admin | 3900 / 3903 |

Web uses API over HTTP and PowerSync over WebSocket. PowerSync needs PostgreSQL logical replication; API uses Garage S3.

For alternate app ports:

```sh
PORT=3001 bun run --cwd apps/api dev
VITE_API_EU_URL=http://localhost:3001 PORT=5174 bun run --cwd apps/web dev
```

## Troubleshoot

- Read service logs with `bun run services:logs`; inspect Redis with Compose logs when needed.
- If PowerSync started before API and cannot connect, restart it:
  `docker compose --env-file apps/api/.env.development -f infra/local/compose.yaml restart powersync`.
- For port conflicts, identify the listener before stopping it. PostgreSQL port override: `DATABASE_PORT` in `apps/api/.env.local`.
- Reset service data only when explicitly requested: `bun run services:down -- -v`, then rerun startup and bucket initialization.

Check root `package.json`, `turbo.json`, `infra/local/compose.yaml`, and app env files when defaults differ.
