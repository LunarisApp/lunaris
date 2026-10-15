# Migrating to SDK 0.7

SDK 0.7 is a coordinated breaking cutover. Update the desktop, API, and every
extension together. There are no 0.6 storage aliases.

## 1. Replace singular storage

```ts
// 0.6
storage: { kind: "yjs", initialize }

// 0.7
storage: { content: { kind: "yjs", initialize } }
```

Use `storage: {}` instead of `{ kind: "none" }`. File resources normally use
`{ content: { kind: "file" } }`; state-only resources use a named
`key-value` slot.

## 2. Declare view requirements

```ts
storageRequirements: { content: "yjs" }
```

Renderer and status-bar props now receive a handle map. Replace document-ID
hooks with `useYjsStorage(storage.content)`, resource-data hooks with
`useKeyValue(storage.settings, key)`, and resource-ID file hooks with
`useStoredFile(storage.cover)`.

## 3. Register workspace KV

Define a `key-value` workspace descriptor, register it with
`contributions.workspaceStorage`, then call `useWorkspaceKeyValue(descriptor, key)`.
Do not store secrets. Undeclared namespaces are rejected.

## 4. Make APIs resource-first

- Remove `documentId` and `storageKind` from resource envelopes and navigation.
- Read `ResourceCreateResult.storage` after creation.
- Use command `storage`, `downloadFile(handle)`, and
  `waitForYjsPersistence(handle)`.
- Compile with `getWorkspaceResource(resourceId)` and
  `getYjsStorageUpdates(handle)`.
- Pass `resourceId` to representation `getContent`.

## 5. Bump manifests and sandbox

Set manifest API compatibility to `^0.7.0`. External release descriptors must
use iframe protocol `5`.

## Persistence migration

The coordinated host migration backfills legacy Yjs/file resources into a
`content` slot, compiler selection/theme into `state:key-value`, and remaining
extension `workspace_data` into an extension-ID workspace KV descriptor. System
enabled-plugin configuration moves into explicit `workspace_extensions` rows.
Legacy `workspace_data` remains read-only for one rollback release.

The backfill identifies legacy file resources by their resource-type-owned
`file:<resourceId>` metadata, not by a built-in extension ID. This preserves
files created by external resource types. Any remaining resource with a legacy
`documentId` becomes a `content:yjs` slot.

External extensions must be rebuilt and republished for API `^0.7.0` and iframe
protocol `5`. Follow the [0.5 migration](./migrating-to-0.5.md) first when
upgrading an extension that still targets 0.4.

Slot names and kinds are immutable. Add a slot with a schema-version bump.
Rename or change kind by adding a new slot, migrating payload, then removing the
old slot only after old clients are retired.

## Search contributions

Register local text extraction with `contributions.searchIndexer(...)`.
Declare `content.read`; also declare `files.read` when calling
`context.readFile(input.storage.cover)`. Federated connectors can register
future search UI results with `contributions.searchQuery(...)` and must declare
`network.https` when using its scoped fetch transport.
