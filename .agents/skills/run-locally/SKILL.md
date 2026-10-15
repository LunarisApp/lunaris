---
name: run-locally
description: "Run Lunaris locally: API, web, and Docker services (PostgreSQL, PowerSync, Garage). Use for fresh-clone setup, local development, bun run dev, Compose startup, missing env files, ports, or container troubleshooting."
---

# Run Lunaris locally

Run commands from the repository root unless stated otherwise.

## Prerequisites

Require Bun 1.3.10+ and a running Docker Desktop installation.

Committed defaults:

- `apps/api/.env.development`
- `apps/web/.env.development`

Use gitignored `.env.local` files for personal overrides. Do not copy or
invent secrets.

## Start

Check existing services first:

```sh
docker compose \
  --env-file apps/api/${LUNARIS_COMPOSE_ENV:-.env.development} \
  -f infra/local/compose.yaml ps
```

Then start only what is missing:

```sh
bun install
bun run services:up
bun run services:init
NODE_ENV=development bun run --filter=api db:migrate
bun run dev
```

`services:init` is a safe, idempotent Garage bucket bootstrap. Apply Drizzle
migrations explicitly before API startup.

To use another API Compose env file:

```sh
LUNARIS_COMPOSE_ENV=.env.e2e bun run services:up
bun --env-file=apps/api/.env.e2e run --filter=api db:migrate
```

The filename is resolved under `apps/api`.

## Architecture and ports

- `apps/web`: Vite React PWA, port 5173.
- `apps/api`: NestJS/Fastify API, port 3000.
- PostgreSQL: 5432.
- PowerSync: 8080.
- Garage S3/admin: 3900/3903.

Web calls API over HTTP and PowerSync over WebSocket. PowerSync uses
PostgreSQL logical replication. API uses Garage's S3 interface.

For non-default app ports, run in the relevant app:

```sh
PORT=3001 bun run --cwd apps/api dev
VITE_API_EU_URL=http://localhost:3001 PORT=5174 bun run --cwd apps/web dev
```

## Diagnose

- Inspect services: `bun run services:logs`.
- Restart PowerSync after starting a late API:
  `docker compose --env-file apps/api/.env.development -f infra/local/compose.yaml restart powersync`.
- Resolve a 5432 conflict by stopping the other PostgreSQL or overriding
  `DATABASE_PORT` in `apps/api/.env.local`.
- Reset local service data only when explicitly requested:
  `bun run services:down -- -v`, then rerun `services:up` and `services:init`.

Relevant files: root `package.json`, `turbo.json`, `infra/local/compose.yaml`,
`infra/local/config/*`, `infra/local/init-scripts/*`, and both app env files.
