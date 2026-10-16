# Lunaris web app

Community Edition is the default. Set `LUNARIS_EDITION=enterprise` when building
or developing to include [enterprise features](../../ee/README.md), subject to
the [EE license](../../ee/LICENSE).

The browser client and installable PWA for Lunaris. React and Vite compose the
shared application shell, workspace UI, extensions, and offline data layer.

## Local development

Follow the [root setup instructions](../../README.md#local-development) to start
PostgreSQL, PowerSync, Garage, and the API. From the repository root:

```sh
bun run dev
```

Open `http://localhost:5173`. To start only this frontend against an already
running API, use `bun run --cwd apps/web dev`.

Development defaults live in `.env.development`; personal overrides belong in
`.env.local`. Vite variables prefixed with `VITE_` are client-visible.

## Code boundaries

This app owns browser startup, PWA configuration, instrumentation, and production
serving. Routes live in `internal/app-shell`; workspace UI in
`internal/workspaces`; sync and persistence in `internal/data`.
See [AGENTS.md](AGENTS.md) for the full package map.

## Build and verify

Run from the repository root:

```sh
bun run build --filter=web
bun run --cwd apps/web typecheck
bun run --cwd apps/web test
bun run --cwd apps/web preview
```

The build includes TypeScript checks, service-worker generation, and PWA asset
and startup-budget assertions. `preview` serves the built app for local checks.
The production Bun server is `serve.ts`, started with
`bun run --cwd apps/web serve`; deployment setup is covered by the
[self-hosting guide](../../infra/self-host/README.md).

For browser workflows and offline behavior, see [E2E tests](../e2e/README.md).

## License and notices

Lunaris-owned code uses [MIT](../../LICENSE). Builds include `LICENSE`,
`THIRD-PARTY-LICENSES.md`, `THIRD-PARTY-NOTICES.md`, and `EXTEND-LICENSE.txt` in
`dist`; preserve them when deploying. The PWA caches these files for offline
access. Enterprise builds also include `EE-LICENSE.txt`. See [third-party notices](../../THIRD-PARTY-NOTICES.md) for outstanding
upstream license reviews.
