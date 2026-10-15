# Lunaris desktop preview

Community Edition is the default. Set `LUNARIS_EDITION=enterprise` when building
or developing to include [enterprise features](../../ee/README.md), subject to
the [EE license](../../ee/LICENSE).

Native desktop client for Lunaris, built with Tauri v2 and the shared React
application shell. Adds native sync, OS keychain authentication, local MCP
access, and the bundled [Agent Work runtime](agent-work/README.md).

## Local development

Follow the [root setup guide](../../README.md#local-development) to install Bun
dependencies, start local services, and migrate the database. Keep the API
running in a separate terminal with `bun run --cwd apps/api dev`.

Use the pinned Rust toolchain in `rust-toolchain.toml`; rustup installs it
automatically. Native PowerSync requires Rust 1.96 or newer.

From the repository root:

```sh
bun run dev:desktop
```

The Tauri hook builds the SDK and agent sidecar before starting Vite. Native
compilation also requires your platform’s Tauri build prerequisites; on macOS,
install Xcode Command Line Tools.

Release builds discover regions from
`https://lunaris.app/.well-known/lunaris-regions`. Debug Tauri builds use local
development configuration from `.env.development`. Production may override the
directory endpoint with `VITE_REGION_DIRECTORY_URL` on a Lunaris domain.

## Authentication and storage

Desktop authentication uses the system browser and returns through `lunaris://`
deep links. Session and CSRF state live in the OS keychain. Only configured
Lunaris API origins use the native HTTP bridge.

PowerSync uses the alpha native Tauri SDK and persists user-scoped SQLite files
in the application data directory. The database is plaintext at application
level; rely on OS disk encryption for at-rest protection. Attachments remain in
WebView IndexedDB.

## ChatGPT Desktop

Lunaris includes a local STDIO MCP server in the installed desktop executable.
Keep Lunaris running, enable **Agent access** in **Settings → Local Data**, then
use **Connect ChatGPT** to choose a permission level and copy the generated
command into ChatGPT Desktop under **Settings → MCP servers → Add server**.
See [OpenAI's MCP setup guide](https://learn.chatgpt.com/docs/extend/mcp).
Read-only is the default. Lunaris displays the first pairing request for
approval and stores the approved MCP credential in the OS keychain.

The equivalent executable interface is:

```sh
Lunaris mcp serve --access read
```

Remote clients require a hosted MCP server or secure tunnel.

## Build and verify

Run from the repository root:

```sh
bun run --cwd apps/desktop typecheck
bun run --cwd apps/desktop test
cargo install --locked --version 0.9.1 --features cli cargo-about
bun run build:desktop
```

Packaging builds shared dependencies, the agent sidecar, the frontend, and
third-party notices. `bun run build --filter=desktop` builds and checks the
frontend only. Release automation produces universal macOS app and DMG bundles;
see [the release workflow](../../.github/workflows/release.yml).

Desktop resources include a `notices` directory containing frontend, agent,
Rust, and vendored-code notices. Preserve these when repackaging. Lunaris-owned
code uses [Apache-2.0](../../LICENSE); unresolved upstream and embedded Bun
requirements are recorded in [third-party notices](../../THIRD-PARTY-NOTICES.md).

## Preview limitations

This app is preview-only. Startup opens region-scoped native databases and leaves
obsolete WebView and unscoped native databases untouched. Unsynced writes from
those databases are not migrated. Downgrades to the Web SDK are unsupported.
Native attachment storage is deferred. Desktop releases are manual downloads
and intentionally have no auto-updater.
