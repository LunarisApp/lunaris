# Extension storage

SDK 0.7 makes storage a property of a resource type. A resource declares a
fixed, named map of slots. A view declares the subset it needs.

```ts
const report = defineResourceType({
  // ...metadata and schema
  storage: {
    content: { kind: "yjs" },
    settings: { kind: "key-value" },
    cover: { kind: "file" },
  },
});

const editor = defineView({
  // ...target and renderer
  storageRequirements: {
    content: "yjs",
    settings: "key-value",
  },
});
```

Use `{}` for a resource without durable storage. Slot names and kinds are
immutable. Adding a slot requires a resource schema-version bump. Rename or
kind changes require a new slot plus a data migration.

## Resource storage hooks

View props contain opaque handles only for `storageRequirements`.

```tsx
function ReportEditor({ storage }: ResourceViewProps) {
  const content = useYjsStorage(storage.content!);
  const compact = useKeyValue<boolean>(storage.settings!, "compact");
  const cover = useStoredFile(storage.cover!);

  // content.yDoc is hydrated collaborative state.
  // compact.set(true) updates synced workspace KV.
  // cover exposes metadata, bytes, and an object URL when available.
}
```

File slots contain zero or one file. Use the host file capability to upload,
replace, or download it:

```ts
const files = useFileStorage();
await files.upload({ file, storage: storage.cover! });
await files.download(storage.cover!);
```

Replacing a file queues the old object for deletion. Multiple fixed file slots
are supported; dynamic file collections are not.

## Workspace KV

Workspace-wide KV must be registered during activation. It is private to the
registering extension.

```ts
const preferences = defineWorkspaceStorage({
  kind: "key-value",
  storageId: "acme.notes.preferences",
});

export default definePlugin({
  manifest,
  activate({ contributions }) {
    contributions.workspaceStorage(preferences);
  },
});

function Settings() {
  const theme = useWorkspaceKeyValue(preferences, "theme");
  // ...
}
```

Disabling an extension unregisters the descriptor, not its durable data.
Undeclared and cross-extension descriptors fail. KV is synced workspace data,
not secret storage.

## Schema payloads

One logical resource schema covers every slot. `ResourcePayloadContext.storage`
contains hydrated Yjs documents, mutable KV snapshots, and read-only file
metadata. Schema migration writes are staged and committed with the resource
version compare-and-set.

Extensions never receive database handles, backing Yjs IDs, attachment object
keys, or another extension's namespace.
