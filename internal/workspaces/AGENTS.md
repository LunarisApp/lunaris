# Workspace product surface

Keep workspace routes, workbench UI, navigation, and extension bindings here.
Use `@repo/data` for persistence/sync and `@repo/features` for reusable cross-tool UI.
App-shell injects shared chrome through route options; keep this package independent
of `@repo/app-shell`.

- For extension registration or host changes, read [extension boundaries](../../extensions/AGENTS.md). Keep generic lifecycle logic in `@repo/plugin-runtime`.
- For resource tree changes, read [explorer invariants](src/features/workspace-explorer/AGENTS.md).
