# Local data

PowerSync owns SQLite persistence and sync; Yjs owns collaborative document state.
Use `@repo/data/features/{feature}` services and hooks from consumers.

## Changes

- For tables, services, and query hooks, read [feature conventions](src/features/AGENTS.md).
- Preserve local-only and synchronized table handling when changing queries or writes. Follow the feature's workspace-storage helpers rather than querying only one backing table.
- For connector changes, extend `PowerSyncBackendConnector` in `src/connectors/base.ts`; implement `fetchCredentials()` and `uploadData()`. `LocalConnector` supports offline-only workspaces.
- For Yjs persistence, inspect `src/features/yjs/`: updates are stored as base64 in `yjs_document_updates`, and providers bind persistence to sync.
