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
see [the release workflow](../../.github/workflows/native.build.yml).

Desktop resources include a `notices` directory containing frontend, agent,
Rust, and vendored-code notices. Preserve these when repackaging. Lunaris-owned
code uses [MIT](../../LICENSE); unresolved upstream and embedded Bun
requirements are recorded in [third-party notices](../../THIRD-PARTY-NOTICES.md).

## Desktop updates

Release builds check for updates at startup, every hour while visible and online,
and when returning online or bringing the app into view. Choose **Update and
restart** to download, verify, install, and restart. Failed downloads or installs
leave the action available for retry. Only the main window runs the updater.

Automatic updates support macOS, Windows, and Linux AppImage installations.
Debian packages use manual/package-manager upgrades. Download the AppImage from
[GitHub Releases](https://github.com/LunarisApp/lunaris/releases/latest) to use
automatic updates on Linux. Local development and builds without an updater key
do not check for updates. Existing releases without this feature need one manual
upgrade first.

### Configure release signing

Generate a persistent signing key using the
[Tauri updater instructions](https://v2.tauri.app/plugin/updater/):

```sh
bun run --cwd apps/desktop tauri signer generate -w ~/.tauri/lunaris-updater.key
```

Store these in GitHub repository Actions settings (use the same values for any
overrides in the `release` environment):

- Variable `TAURI_UPDATER_PUBLIC_KEY`: complete contents of the `.pub` file.
- Secret `TAURI_SIGNING_PRIVATE_KEY`: complete private key file contents.
- Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: key password, if configured.

Back up the private key securely. Keep it stable across releases: installed apps
trust the matching public key. This signature is separate from Apple code signing
and notarization. Never commit the private key or put it in a `VITE_` variable.

The release workflows generate a Tauri config overlay with the public key and
`createUpdaterArtifacts: true`. macOS builds emit `.app.tar.gz`, Windows builds
reuse NSIS `.exe`, and Linux builds emit `.AppImage`, each with a `.sig` file.
Packaging rejects signatures whose signing key ID differs from the embedded
public key. Tauri verifies the signature and downloaded bytes before installation.
Immutable receipts and checksums include these files. Finalization publishes
`desktop-updater.json` only after all platform assets are verified, then makes
the stable GitHub release public. The feed covers both macOS architectures.
Resuming an older reservation with cached installers finishes without an update
feed; those releases still support manual installation.

## Preview limitations

This app is preview-only. Startup opens region-scoped native databases and leaves
obsolete WebView and unscoped native databases untouched. Unsynced writes from
those databases are not migrated. Downgrades to the Web SDK are unsupported.
Native attachment storage is deferred.
