# Extension development

Lunaris supports bundled and runtime-installed sandboxed extensions.

An extension package owns three integration files:

1. `manifest.json` declares identity, API compatibility, permissions, dependencies, and conflicts.
2. `index.tsx` default-exports `definePlugin({ manifest, activate })`.
3. `descriptor.ts` default-exports `definePluginDescriptor({ manifest, icon, routes, load })`; `load` dynamically imports `index.tsx`.

Extension implementation code may import `@lunarisapp/plugin-sdk`, its public
`data`, `time`, and `worker` subpaths, `@lunarisapp/ui`, and declared
third-party packages. It must not import private SDK, sandbox, `@repo/*`, or
`@extension/*` modules.

`activate` registers resources, views, workspace storage descriptors,
capabilities, and locales, and may return cleanup. Side effects belong in
`effects.add`; Lunaris starts them only after the atomic registration commit.
The descriptor and loaded module must have identical manifests. Registration
closes when activation returns.

Resource types declare named durable slots. Resource views declare exactly the
subset they need:

```ts
contributions.resourceType(defineResourceType({
  // ...identity and schema
  storage: {
    content: { kind: "yjs" },
    settings: { kind: "key-value" },
  },
}));

contributions.view(defineView({
  // ...identity, target, and renderer
  storageRequirements: { content: "yjs" },
}));
```

Run the extension package's `typecheck` and tests. The app registry test
enforces package boundaries. See [storage](storage.md),
[resources](resources.md), [views](views.md), and the
[0.9 migration guide](migrating-to-0.9.md).
