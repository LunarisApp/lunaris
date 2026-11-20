# Connect an MCP client to Lunaris

The Model Context Protocol (MCP) lets an AI client work with Lunaris after you approve its access. Organization and workspace permissions still apply.

- **Cloud** uses HTTP and can access synced Private and Shared workspaces. Sign in when the client first connects, then review the requested permissions and select the organizations it may access. Manage or revoke connections in **Settings → Account → Connected agents** in the same region.
- **Desktop preview** uses stdio and can also access Local workspaces stored in the desktop app. Enable **Agent access** in **Settings → Local Data**, keep Lunaris Desktop running, then approve the pairing request. Revoke clients from the same setting.

See the [MCP documentation](https://docs.lunaris.app/developers/mcp) for authorization, troubleshooting, and remote clients.
