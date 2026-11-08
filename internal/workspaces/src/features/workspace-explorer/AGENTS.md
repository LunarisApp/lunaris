# Workspace explorer

PowerSync `workspace_resources` queries are the resource tree's source of truth.
Keep resource data in query results; derive `resourcesMap` and `childrenMap` in
`store/provider.tsx`. UI navigation state has a separate lifecycle.

## Storage invariants

- Persist top-level parents as `parent_id = null`; use `VIRTUAL_ROOT_ID` only inside the tree. Normalize it at the persistence boundary.
- Generate every resource ID, including folders, with `createId("res")`.
- Keep Yjs backings behind named `workspace_storage_slots` handles.
- Preserve sibling order through integer `position` values.
- Read and write through `@repo/data/features/workspace-resources` services.

For tree interactions, use `@lunarisapp/ui/components/tree` and existing explorer
extensions. Preserve keyboard navigation, drag/drop, and inline rename behavior;
`doubleClickRenameFeature` owns double-click rename.
