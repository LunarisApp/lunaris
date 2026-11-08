# Data features

Follow a neighboring feature's `table.ts`, `services.ts`, optional `schemas.ts`,
and `index.ts`. Public imports use `@repo/data/features/{feature}`.

## Add or change a feature

1. Define tables using `Table`, `column`, and `RowType` from `@powersync/common`. Preserve the `localOnly` and `viewName` factory options.
2. Register new tables in `createAppSchema()` in `src/features/index.ts` (relative to `internal/data`).
3. Implement services accepting `{ db: DatabaseOrTx }` so callers can share transactions. Generate IDs with `createId(prefix)` from `@repo/utils`.
4. Wrap `@powersync/react` queries in feature hooks. Follow existing workspace-storage helpers for local/synchronized table selection.
5. Export the feature API through `index.ts` and verify consumers can resolve its package export.

Use named SQL table constants and derive entity types with
`RowType<ReturnType<typeof createXxxTable>>`.

## Yjs lifecycle

Use `useReadyYjsDocument(documentId, workspaceId, options?)` to acquire a cached
Y.Doc/provider. Render loading and error states until `yDoc` is available.
The shared resource store supports multiple mounted views and reuse after unmount;
read `yjs/document-resource-store.ts` for cache identity and lifetime before changing
ownership or cleanup. Preserve shared instances when closing one of several views.
