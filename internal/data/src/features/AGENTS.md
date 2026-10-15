# Data Features

Feature-based layout for PowerSync tables + services.

## Structure

Each feature folder contains:
- `table.ts` - Table definition via `createXxxTable()`, exports `XxxEntity` via `RowType<>`
- `services.ts` - CRUD ops, hooks (`useXxxQuery`, `useXxxSuspenseQuery`), `createXxxService()`
- `schemas.ts` - Zod validation schemas (optional)
- `index.ts` - Re-exports all modules

## Patterns

- Table names: `const XXX_TABLE = "tableName"` for SQL
- Entity types: `RowType<ReturnType<typeof createXxxTable>>`
- Services accept `{ db: DatabaseOrTx }` for tx support
- Use `createId("prefix")` from `@repo/utils` for IDs
- Hooks wrap `useQuery`/`useSuspenseQuery` from `@powersync/react`

## Yjs Feature

Primary hook for collaborative doc storage:
- `useReadyYjsDocument(documentId, workspaceId, options?)`: ensures doc exists, loads it, caches the Y.Doc + provider across mount/unmount. Returns `{ yDoc, yProvider, isLoading, error }`.

Pattern for extensions:
```tsx
const { yDoc, isLoading, error } = useReadyYjsDocument(documentId, workspaceId);
if (isLoading && !yDoc) return <LoaderView label="Loading..." />;
if (!yDoc) return <PanelError ... />;
```

The hook caches the Y.Doc in memory. Closing and reopening the same doc within ~30s reuses the cached instance (no rehydration). Split-view panels opening the same doc share one Y.Doc.

## Adding Features

1. Create folder under `src/features/`
2. Add table.ts with `createXxxTable()` factory
3. Register in `src/features/index.ts` `createAppSchema()`
4. Add services.ts with queries + mutations
5. Export via index.ts
