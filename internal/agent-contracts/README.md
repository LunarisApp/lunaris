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
