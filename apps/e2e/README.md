# Lunaris browser tests

Cypress tests for application workflows, authentication, sync, and offline
behavior. Unit and component tests stay with their owning workspaces.

## Run locally

Complete the [local setup](../../README.md#local-development), including database
migrations. Run the API with captured logs in one terminal and the web app in
another, using commands from the repository root:

```sh
# Terminal 1
mkdir -p logs
bun run --cwd apps/api dev > logs/backend.log 2>&1
```

```sh
# Terminal 2
bun run --cwd apps/web dev
```

Then launch the suite or interactive runner:

```sh
CYPRESS_BACKEND_LOG_PATH="$PWD/logs/backend.log" bun run e2e
CYPRESS_BACKEND_LOG_PATH="$PWD/logs/backend.log" bun run e2e:open
```

Tests create and mutate data: use a development environment. Email flows read
authentication links from the captured API log.

## Configuration

- `cypress.config.ts` defines browser settings and backend-log tasks.
- `cypress/` contains specs, support code, and fixtures.
- `CYPRESS_BASE_URL` overrides the default `http://localhost:5173`.
- `CYPRESS_BACKEND_LOG_PATH` selects the API log; without it, the default is
  `apps/api/backend.log`.
- `CYPRESS_PWA_OFFLINE` controls inclusion of the offline suite; inspect
  `cypress.config.ts` and the [E2E workflow](../../.github/workflows/e2e.yml)
  before running those tests against a production build.

Typecheck test code with `bun run --cwd apps/e2e typecheck`.

## License

Lunaris-owned tests use [MIT](../../LICENSE). Third-party fixtures and
libraries retain their own notices.
