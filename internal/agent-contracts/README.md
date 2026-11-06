# Agent contracts

`src/operations.ts` defines each agent operation’s name, scope, offline
availability, HTTP route, and input/output schemas. Built-in extensions own
additional MCP capabilities under `extensions/*/src/mcp.ts`; `src/extension-mcp.ts` is the explicit
host registry. Tools may delegate to core operations or declare extension-owned
procedures. Hosts dispatch procedures through `LunarisControlClient` while the
generated manifest keeps Desktop, CLI, and API transport identical.

Generate the runtime-neutral contract after changing an operation:

```sh
bun --cwd internal/agent-contracts generate:mcp
```

The generated `generated/agent-mcp-manifest.json` is consumed by:

- `apps/api/src/agents/mcp/agent-tools.server.ts` for the cloud NestJS MCP server
- `crates/agent-mcp` for the Rust CLI and bundled Desktop MCP server
- the Desktop broker for exact operation and scope resolution

`offlineAvailability: "cloud-required"` marks operations that Desktop proxies
through the signed-in cloud API. They remain discoverable everywhere and return
`CLOUD_UNAVAILABLE` only when Desktop cannot reach the cloud service.

CI runs `check:mcp`; stale generated contracts fail the build.

For built-in content workflows:

- Discover resources with `search_resources`; reuse its organization, workspace,
  and resource IDs instead of enumerating workspaces again.
- Read Rich Text once with `rich_text_get_document`. Use `rich_text_edit_document`
  for ordered `update`, `insert`, and `delete` block edits. Updates merge props
  and preserve children; inserts specify a parent and sibling (null means
  root/first); deletes remove the subtree. Up to 100 edits commit atomically.
  Pass `expectedRevision`; reuse the receipt's revision for the next edit.
  A failed batch changes nothing. On conflict, reread and rebuild the edits.
  Keep at least one block; clear its content to empty the resource.
- Use `rich_text_update_document` for initial content or complete rewrites.
  `rich_text_read_me` provides optional formatting examples. Markdown previews
  are lossy; preserve native blocks when editing existing content.
- Use `kanban_get_board` for property definitions/options and task values in one
  read. Task `updatedAt` is the rename revision. Read subsequent pages using
  `nextOffset` until null before summarizing the whole board. Pages are live;
  restart if tasks change during traversal. Task descriptions are excluded.
  `kanban_get_board_properties` remains useful when only definitions are needed;
  `kanban_list_tasks` returns resource metadata and storage handles.

These procedures share extension-owned schemas and document logic across API,
Desktop, and in-app agent tools. Hosts retain authorization and idempotency.
