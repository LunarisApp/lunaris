# Resources

A resource type owns durable data. A view owns none. One resource may compose
multiple named Yjs, key-value, and single-file slots.

```ts
const note = defineResourceType({
  defaultViewId: "acme.notes.editor",
  hierarchy: { userCreatable: true, visible: true },
  icon: NoteIcon,
  name: "Note",
  resourceTypeId: "acme.notes",
  schema: {
    currentVersion: 1,
    id: "acme.notes.document",
    read: ({ storage }) => ({
      content: storage.content?.kind === "yjs"
        ? storage.content.document.toJSON()
        : {},
      settings: storage.settings?.kind === "key-value"
        ? storage.settings.values
        : {},
    }),
    versions: { 1: noteSchema },
  },
  storage: {
    content: { kind: "yjs" },
    settings: { kind: "key-value" },
  },
});
```

`resourceTypeId`, schema ID, slot names, and slot kinds are immutable.
`resourceId` identifies an instance in hierarchy, navigation, compilation, and
storage authorization. Resource envelopes do not expose a singular document ID
or storage kind.

Versions start at `1`. Each version needs a Standard Schema validator and each
adjacent migration needs a pure migration function. A slot addition must ship
with a schema bump; Lunaris provisions it in the same compare-and-set
transaction as the migrated payload. Invalid, newer, or corrupt layouts are
quarantined without mutating stored data.

`createInWorkspace` receives scoped `createResource`, `deleteResource`, and
`uploadFile` capabilities. Creation of the resource, slot bindings, initial KV,
initial Yjs state, and backing documents is atomic.

Commands and resource readers are resource-first. Child-resource lists contain
each child's own storage handles, so a view can safely render a list of Yjs
resources rather than assuming one document per view.
