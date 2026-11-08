# Cross-tool features

Keep reusable product features here. Workspace-specific routes, workbench UI,
Dockview integration, and explorer bindings belong in `internal/workspaces`.

Expose consumers through `@repo/features/{feature}` or an explicit package export.
Keep feature components, hooks, and state together; follow the nearest feature's
provider pattern. When using a Zustand context store, create one store per provider
and make consuming hooks fail clearly outside that provider.

Use `@repo/data` for persistence and `@lunarisapp/ui` for shared controls.
Shared feature locale strings live in `src/locale/locales`; extension-owned strings
stay with their extension.
