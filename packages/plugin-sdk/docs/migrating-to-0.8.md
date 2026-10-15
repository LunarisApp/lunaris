# Migrating to SDK 0.8

SDK 0.8 removes resource-facing document IDs. Resources are the stable identity;
named storage handles select their persisted content.

- Set the extension manifest `api` range to `^0.8.0`.
- Replace `activeDocumentId` with `activeResourceId` and `activeStorage`.
- Replace `readDocumentJson(id)` with
  `readYjsStorageJson(storageHandle)`.
- Pass a Yjs storage handle to history hooks.
- Resolve names, navigation, breadcrumbs, search results, and entity references
  by resource ID. Use storage only when reading persisted content.
- When creating a resource, provide every storage definition explicitly.
  Folders use `storage: {}`.

All extensions must be rebuilt and deployed with the coordinated API/web
cutover. SDK 0.8 has no document-ID compatibility layer.
