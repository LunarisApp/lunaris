# @repo/workspaces

Workspace routes, workbench, explorer, search, settings, and extension host.
Uses `@repo/data` for persistence and sync. See [package boundaries](AGENTS.md).

## Experimental WebMCP

Set `VITE_WEBMCP_ENABLED=true` when starting or building the web app to expose
tools to browser agents inside an authorized workspace. Disabled by default.
Requires a browser exposing `document.modelContext.registerTool`; unsupported
browsers continue without registering tools. No polyfill is installed.

- `lunaris_get_context`: active workspace and opened resource IDs.
- `lunaris_search_resources`: paginated search restricted to the active workspace.
- `lunaris_<extension tool name>`: existing read tools for active built-in
  extensions, including Rich Text and Kanban. Writers also get Rich Text and board
  creation, task creation/updates, and revision-checked Rich Text block edits.
  Organization and workspace IDs are injected by the host; input schemas and execution use existing agent contracts.
- `lunaris_read_active_resource`: metadata plus native Rich Text blocks/revision
  or the first Kanban page; follow returned pagination for remaining tasks.
- `lunaris_read_editor_selection`: selected Rich Text with resource ID/revision.
  Rejects selections outside the active editor and changes during the read.
- `lunaris_open_resource`: opens a resource in the active workspace.
- `lunaris_get_resource`: resource metadata with `updatedAt` for revision checks.
- `lunaris_update_resource`: rename/move using `expectedRevision` and idempotency.
- `lunaris_read_file`: file metadata plus cached UTF-8 text up to 1 MiB for
  text/*, JSON, XML, JavaScript and YAML. Other formats return metadata and a
  status; missing bytes are reported as `not_cached`. HTML is returned as text.
- `lunaris_edit_editor_selection`: replace or format a captured selection using
  its `selectionToken`, revision, and idempotency key. Supports bold, italic,
  underline and strike. Bookmarks remain valid only for the exact editor content
  captured; any content change requires a new selection read. Edits use the
  editor transaction pipeline and support keyboard undo. Tokens retain the last
  ten selections until the workspace closes.
- `lunaris_undo_rich_text_edit`: restores the snapshot identified by an edit's
  `undoToken`, provided its resulting revision is still current. Keeps the last
  ten edits until the workspace closes; survives resource navigation. This is
  explicit WebMCP undo, separate from the editor's keyboard undo history.

Writes require existing host permissions and stable idempotency keys. Rich Text
edits require `expectedRevision`; they return the next revision and undo token.
Local Rich Text persistence is flushed before reads and writes. Resource deletion,
sharing, billing, and direct full-resource replacements are excluded.
Tools return structured JSON; resource content is marked untrusted. Navigating
away, switching workspace, or changing extension registrations aborts registrations
and invalidates pending results. Already dispatched writes may still complete;
retry with the same idempotency key after an uncertain outcome. The adapter lives in
`src/extensions/host/webmcp.ts`.

Native smoke testing used Chrome 157 with WebMCP enabled, the actual adapter,
and a collaborative BlockNote editor backed by an isolated fixture. Selection
replacement, partial formatting, and editor undo were verified through native
WebMCP tool invocation. Authenticated workspace persistence remains covered by
host/service tests rather than that browser fixture.
