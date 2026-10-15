# Lunaris API

Community Edition is the default. Set `LUNARIS_EDITION=enterprise` when building
or developing to include [enterprise features](../../ee/README.md), subject to
the [EE license](../../ee/LICENSE).

Backend for Lunaris workspaces, resources, collaboration, and account management.
Built with NestJS, Fastify, PostgreSQL, and Drizzle; integrates Better Auth,
PowerSync, Yjs, Polar billing, and Resend email.

## Local development

Complete the [root setup](../../README.md#local-development), then run only the
API on port `3000` from the repository root:

```sh
bun run --cwd apps/api dev
```

For deployment, see the [self-hosting guide](../../infra/all-in-one/README.md).

`.env.development` supplies local defaults, including
`EMAIL_VERIFICATION_DISABLED=true`, `POLAR_DISABLED=true`, and
`DEV_ENTITLEMENT_PLAN=business`. Authenticated local users receive the Business
plan without Polar credentials. Use gitignored `.env.local` for personal
overrides. The development entitlement override is ignored in production.

## Working on the backend

| Area | Location |
| --- | --- |
| Startup and HTTP configuration | `src/main.ts` |
| Feature modules and database entities | `src/<feature>/` |
| Generated database migrations | `drizzle/` |
| Client sync handlers | `src/sync/handlers/` |
| Collaborative Yjs persistence | `src/yjs/` |
| Security audit policy | [Audit README](src/audit/README.md) |

Database changes often also require updates to local
[sync rules](../../infra/local/config/sync_rules.yaml) and the client data layer
in `internal/data`. Read [backend contribution instructions](AGENTS.md) before
changing a feature.

From the repository root:

```sh
bun run --cwd apps/api typecheck
bun run --cwd apps/api test
bun run --cwd apps/api test:coverage
bun run --cwd apps/api build
```

Generate migrations with `NODE_ENV=development bun run --filter=api db:generate`;
review the generated SQL before applying it. Browser E2E tests live in
[`apps/e2e`](../e2e/README.md).

## Optional integrations

### Agent Work

Agent Work and Agent Work Mini share the `agent-work` PostHog boolean flag.
The API evaluates it using the stable user ID and email on every plan.
Anonymous users, missing PostHog configuration, and evaluation failures deny
access. The [desktop Pi runtime](../desktop/agent-work/README.md) handles
conversations and provider authentication.

### Polar billing

Billing is enabled only when all Polar settings are present. Configure four
recurring, per-seat products (Plus and Business, monthly and annual), the
webhook secret, and an access token. In Polar, enable multiple subscriptions
per customer so one owner can pay for independent organizations, and disable
plan changes and seat management in the customer portal so organization limits
and billed member counts cannot be bypassed. Apply these settings in both
sandbox and production.

Checkout accepts only those four configured products. Existing paid
organizations change plans in the application and cancel through the customer
portal; a second checkout for the same organization is rejected.

## License

Lunaris-owned API code uses [Apache-2.0](../../LICENSE). Dependencies retain their
own terms; see [third-party notices](../../THIRD-PARTY-NOTICES.md).
