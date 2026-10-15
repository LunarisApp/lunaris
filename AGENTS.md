Launch `caveman` skill as the first step in the session.

# Agents

- Write ultra-concise. Grammar optional.
- Prefer simple over complex abstractions.
- End plans with unresolved questions list, if any.
- Write code **accessible, performant, type-safe, maintainable**.

# Project Overview

Lunaris = modern offline-first cross-platform word processor.

### Terminology

- **Resource**: workspace content entity, including folders, files, boards, tasks, and rich text.
- **Resource view**: rendered presentation of an opened resource. Use these names in files, symbols, UI copy, and telemetry.
- Keep precise external concepts: browser `document`, Yjs documents, file-format documents, and generic UI/tree items.
- Legacy names belong only in migration/compatibility reads and their tests; preserve existing stored data.

### Shared Technologies

- **Bun** - Pkg mgr + runtime
- **TypeScript** - Type safety
- **Turborepo** - Monorepo orchestration
- **Better Auth** - Authentication
- **Polar** - Payments
- **Resend** - Email
- **Yjs** - CRDT for collaborative editing

### Shared Packages

- `@repo/typescript-config` - `internal/typescript-config` - Shared TypeScript config
- `@repo/utils` - `internal/utils` - Shared utils + helpers
- `@repo/auth` - `internal/auth` - Shared auth for clients + API. Better Auth + Polar.
- `@lunarisapp/plugin-sdk` - `packages/plugin-sdk` - Public extension API.
- `@lunarisapp/ui` - `packages/ui` - Public shared UI.

### Ecosystem
Apps compose private `internal/*` libraries and the two public packages. See
`apps/web/AGENTS.md` and `apps/api/AGENTS.md`.

# Critical Codebase Areas

| Area | Layer | Key Paths | What Lives Here |
|------|-------|-----------|-----------------|
| **Database** | Backend | `apps/api/src/{feature}/*.entity.ts`, Drizzle schemas | PostgreSQL tables, column defs, relations |
| **Sync** | Backend | `apps/api/src/sync/handlers/`, `infra/local/config/sync_rules.yaml` | PowerSync rules + entity handlers controlling client sync |
| **Data** | Frontend | `internal/data/src/features/{feature}/` | PowerSync SQLite tables, Zod schemas, CRUD services |
| **Extensions** | Frontend | `packages/plugin-sdk/src/`, `internal/workspaces/src/extensions/`, `extensions/*/src/` | Public SDK + private workspace host/registry; each extension owns ID, metadata, React component, locales |
| **Workspaces** | Frontend | `internal/workspaces/src/` | Workspace routes, workbench UI, navigation, editor integration, and extension host |
| **UI** | Frontend | `packages/ui/src/` | Shared Shadcn/Base UI + Tailwind |
| **i18n** | Frontend | `internal/features/src/locale/locales/`, `extensions/*/src/locales/` | Two locale layers: feature-level + per-extension |
| **Routing** | Frontend | `internal/app-shell/src/router.tsx` | React Router tree; add routes here |
| **Collab** | Both | `apps/api/src/yjs/`, `internal/data/src/features/yjs/` | Yjs doc sync; backend persistence + frontend binding |

> Most features touch **Database → Sync → Data → Feature module**.

# Procedures
- After code changes, use `code-review` skill for review/lint/format/typecheck/code-quality checks before merge. Omit when doc-only changes.
- Use `caveman-commit` skills for commit and pr messages. Always.
- If building a UI feature, use `with-screenshot` skill to show how it looks. Use only if you think it adds value.
