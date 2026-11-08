Load the `caveman` skill first each session.

# Working conventions

- Write concise responses; preserve technical precision.
- Prefer simple implementations over new abstractions.
- End plans with unresolved questions, if any.
- Keep code accessible, performant, type-safe, and maintainable.

# Lunaris

Offline-first, cross-platform word processor. Apps compose private `internal/*`
libraries and public `@lunarisapp/plugin-sdk` and `@lunarisapp/ui` packages.
Read scripts, dependencies, and exports from the relevant `package.json`.

## Terminology

- **Resource**: workspace content entity, including folders, files, boards, tasks, and rich text.
- **Resource view**: rendered presentation of an opened resource. Use these terms in files, symbols, UI copy, and telemetry.
- Preserve precise external terms: browser documents, Yjs documents, file-format documents, and generic UI/tree items.
- Preserve stored data and existing ID formats; stored references depend on them. Keep legacy names only in migration/compatibility reads and their tests.

## Ownership

Read an area's `AGENTS.md` when listed below, including when reached from another app or package.

| Work | Owner / guidance |
| --- | --- |
| Backend entities and sync handlers | `apps/api/src/{feature}/*.entity.ts`, `apps/api/src/sync/handlers/`; sync rules in `infra/local/config/sync_rules.yaml` |
| Local tables, queries, persistence, Yjs | [internal/data](internal/data/AGENTS.md) |
| Workspace routes, workbench, navigation, extension host | [internal/workspaces](internal/workspaces/AGENTS.md) |
| Cross-tool features and shared locales | [internal/features](internal/features/AGENTS.md) |
| Extension implementations and locales | [extensions](extensions/AGENTS.md); public contracts in `packages/plugin-sdk` |
| Shared UI | [packages/ui](packages/ui/AGENTS.md) |
| Platform capabilities | [internal/platform](internal/platform/AGENTS.md) |
| PWA composition | [apps/web](apps/web/AGENTS.md) |
| User documentation / marketing | [apps/docs](apps/docs/AGENTS.md) / [apps/landing](apps/landing/AGENTS.md) |
| Shared utilities | `internal/utils`, imported through `@repo/utils` |

For persisted features, account for backend entity, sync rules/handler, local data,
and consuming UI. Verify each affected layer; not every change needs all four.

## Routing and local data

Compose routes through `internal/app-shell/src/router.tsx` and existing route
factories. Follow nearby auth and organization guards. Keep reactive local data
in `internal/data` PowerSync hooks and services; preserve subscriptions when
adding loaders.

# Validation and delivery

- For code or documentation changes, load [lunaris-dev](.agents/skills/lunaris-dev/SKILL.md) for relevant validation. Use its setup or screenshot guide when running locally or capturing UI evidence.
- Use Conventional Commits subjects: aim for 50 characters, maximum 72. Explain non-obvious reasons, breaking changes, security fixes, migrations, and reverts in the body.
- Describe PRs through the problem, final behavior, and validation. Review findings identify file/line, problem, consequence, and a concrete fix; expand when rationale needs explanation.
