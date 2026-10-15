# Workspace Explorer Feature

Manages workspace file/folder tree via SQL `workspace_resources` synced through PowerSync.

## Architecture

- **SQL-based**: Resources in `workspace_resources` with `parent_id` self-reference
- **No Zustand store**: PowerSync `useSuspenseQuery` replaces state
- **Provider**: Derives `resourcesMap` (Map<id, entity>) + `childrenMap` (Map<parentId, entity[]>) via `useMemo`

## Key Types

- `WorkspaceResourceEntity`: SQL row type from `@repo/data/features/workspace-resources`
- `WorkspaceResourcesMap`: `Map<string, WorkspaceResourceEntity>` for ID lookups
- `ChildrenMap`: `Map<string | null, WorkspaceResourceEntity[]>` for parent→children traversal

## Resource IDs & Storage

- Top-level resources have `parent_id = null`. Tree uses virtual root sentinel `VIRTUAL_ROOT_ID`
- Workspace resource IDs use `createId("res")` for all resource types, including folders
- **Resource storage**: named `workspace_storage_slots` handles own Yjs backings
- **Icon**: JSON-serialized `IconSvgObject` in text column, parsed via `parseResourceIcon()`
- **Position**: Integer sibling order; supports drag-drop reorder

## Tree Component

Uses `@lunarisapp/ui/components/tree` with drag-drop, rename, keyboard nav.
Custom `doubleClickRenameFeature` enables inline rename on double-click.

## Services

- CRUD operations via `@repo/data/features/workspace-resources` services
