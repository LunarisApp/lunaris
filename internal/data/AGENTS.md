# Data Package

Local-first data layer with PowerSync (SQLite + sync) + Yjs (CRDT).

## Structure

- `src/core/` - PowerSync DB factory, provider, schema utils
- `src/connectors/` - PowerSync backend connectors (base class + impls)
- `src/features/` - Feature modules with table definitions and services

## Key Patterns

### Table Definitions

Tables use `@powersync/web` `Table` with `column.*` typed columns:

```ts
export const createXxxTable = ({ localOnly }: CreateSchemaTableProps = {}) =>
  new Table({ field: column.text }, { localOnly, viewName: "xxx" });
export type XxxEntity = RowType<ReturnType<typeof createXxxTable>>;
```

### Connector Pattern

Extend `PowerSyncBackendConnector` from `./connectors/base.ts`:
- Override `fetchCredentials()` and `uploadData()`
- `LocalConnector` = offline-only mode

### Feature Exports

Each feature exports via `./features/*` in package.json.
Import as `@repo/data/features/workspaces`.

### Yjs Integration

Yjs docs store base64 updates in `yjs_document_updates`.
`./features/yjs/` provider handles persistence + sync.
