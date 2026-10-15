# Views

Views own UI, never durable storage. A resource view declares the named slots
and kinds it consumes.

```tsx
const editor = defineView({
  icon: NoteIcon,
  name: "Note editor",
  renderer: ({ resource, storage }) => (
    <NoteEditor resourceId={resource.resourceId} content={storage.content!} />
  ),
  statusBar: ({ storage }) => <WordCount content={storage.content!} />,
  storageRequirements: { content: "yjs" },
  target: {
    kind: "resource",
    resourceTypeIds: ["acme.notes"],
    schemas: [{ id: "acme.notes.document", minimumVersion: 1 }],
  },
  viewId: "acme.notes.editor",
});
```

The host matches target resource type, schema range, slot name, and slot kind
before offering or opening a view. Only required handles are passed. A missing
default-view requirement fails activation; a corrupt persisted layout
quarantines the resource.

Different views may consume different subsets of the same resource. A summary
view might require only `settings:key-value`; an editor might additionally
require `content:yjs`. Use `storageRequirements: {}` for a resource view that
needs no storage.

For lists, read child resources with `useWorkspaceChildrenMap()` or
`useWorkspaceResourcesMap()`. Every `PluginResource` carries its own named
handles. Call `useYjsStorage(child.storage.content!)` in a stable child
component; do not treat the containing view as owning one shared document.

`viewId` identifies a registered definition. `viewInstanceId` identifies an
open organization instance. Resource navigation is resource-first and does not
accept document IDs.
