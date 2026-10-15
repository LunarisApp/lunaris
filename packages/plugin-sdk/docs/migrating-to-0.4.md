# Migrating from 0.3 to 0.4

SDK 0.4 is intentionally breaking. There are no 0.3 compatibility aliases.
External extensions must rebuild for sandbox protocol 2.

- Remove `manifest.contributions`; keep identity, API range, permissions,
  dependencies, and conflicts.
- Replace each content type with one `ResourceTypeDefinition` and one compatible
  `ViewDefinition` when it has UI.
- Move actions to resource commands, status-bar renderers to status
  contributions, and compile extraction to representation providers.
- Replace `openItem` with `openResource`; use `resourceId`, `resourceTypeId`,
  `extensionId`, `viewId`, and `viewInstanceId` consistently.
- Register possible types with `contributions.resourceType(...)`. Create
  persisted hierarchy instances with `useWorkspaceResourceActions().createResource(...)`,
  or the scoped `createResource(...)` inside `createInWorkspace`.
- Replace `closeViews`, `setViewTitle`, and `activeViewId` with
  `closeViewInstances`, `setViewInstanceTitle`, and `activeViewInstanceId`.
- Add an immutable schema ID, version-1 Standard Schema validator, logical
  payload reader, and storage kind to every resource.
- Register everything synchronously during `activate`. Late registration deltas
  are not supported in 0.4.

The host migration renames `workspace_items` to `workspace_resources`, `plugin_id`
to required `resource_type_id`, and adds required `schema_version`. Existing
non-folder type IDs and resource IDs are preserved; untyped folders become
`lunaris.folder`. New resources use the `res_` prefix.
