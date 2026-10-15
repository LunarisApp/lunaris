# Workspaces Package

Owns complete Workspaces frontend product surface.

- Keep routes, workspace-aware UI, navigation, and extension bindings here.
- Use `@repo/data` for persistence and sync.
- Use `@repo/features` only for reusable cross-tool features.
- Never import `@repo/app-shell`; app-shell injects shared chrome through route options.
- Keep generic extension lifecycle logic in `@repo/plugin-runtime`.
