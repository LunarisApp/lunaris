# Extensions

Each built-in extension is an `extensions/{slug}` package named `@extension/{slug}`.
Runtime IDs remain `lunaris.*`.

## Import boundary

Extension source may import its own files/package, declared third-party packages,
`@lunarisapp/ui/*`, and these SDK entrypoints:

- `@lunarisapp/plugin-sdk`
- `@lunarisapp/plugin-sdk/data`
- `@lunarisapp/plugin-sdk/mcp`
- `@lunarisapp/plugin-sdk/time`
- `@lunarisapp/plugin-sdk/worker`

Keep `@repo/*` and other extensions behind the host boundary.
`internal/workspaces/src/extensions/registry.test.ts` enforces isolation.

## Registration and runtime

- Each extension owns its manifest, descriptor, component, and locales.
- `internal/workspaces/src/extensions/registry.ts` imports `@extension/*/descriptor`; each descriptor owns its lazy `import("./index")`.
- Keep implementation in the extension and host integration in `internal/workspaces/src/extensions/host`.
- Rich Text owns its PDF renderer in `extensions/rich-text/src/pdf`.

For MCP capabilities, keep declarations in `mcp.ts` runtime-neutral. Put procedure
schemas in `mcp-contract.ts` and pure Yjs document logic in `mcp-runtime.ts`.
API/Desktop hosts own authorization, persistence, idempotency, and transport.
