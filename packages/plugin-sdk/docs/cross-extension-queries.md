# Workspace and extension catalogs

Extensions read semantic workspace state through SDK hooks:

- `useWorkspaceResourcesMap()` and `useWorkspaceChildrenMap()` expose the current hierarchy.
- `useWorkspaceResourceActions()` creates, renames, reorders, touches, and deletes
  persisted workspace resources.
- `useResourceTypes()` exposes registered resource contracts without leaking
  complete extension definitions.
- `useOrganizationNavigation()` opens workspace resources and registered views.

These capabilities are workspace-scoped and reactive. Extensions do not query workspace tables, subscribe to database rows, or read another extension's private storage.
