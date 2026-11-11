# Lunaris CLI

Manage Lunaris workspaces and resources from your terminal, scripts, or an MCP
client. This Rust CLI connects to Lunaris servers and the desktop app.

The crate is not published to crates.io.

## Build from source

Use the Rust toolchain pinned in `rust-toolchain.toml`. Commands below run from
the repository root; the contract tests also require Bun dependencies.

```sh
cargo build --release --manifest-path apps/cli/Cargo.toml
./target/release/lunaris --help
```

## Connect and use

Sign in, choose an organization, then query its workspaces and resources:

```sh
lunaris --server us auth login --organization organization_123
lunaris --server desktop auth login --organization organization_123 --access full
lunaris workspace list
lunaris resource search "roadmap" --workspace-id workspace_123
lunaris mcp serve
```

With a terminal, `auth login` prompts for any missing server and default
organization. To omit a default organization:

```sh
lunaris --server us auth login --no-default-organization
```

Agent operations come from the shared
[contract manifest](../../internal/agent-contracts/generated/agent-mcp-manifest.json). Both this CLI and
Lunaris Desktop use `crates/agent-mcp` for MCP tool/resource registration,
HTTP serialization, scope metadata, and structured errors.

For scripting or new contract fields, call an operation directly:

```sh
lunaris call search_resources \
  --input '{"organizationId":"organization_123","search":"roadmap"}'
```

## Help and output

Use `lunaris --help` to explore commands and `lunaris resource create --help`
for argument descriptions. `--timeout` is in milliseconds; `--login-timeout`
and `--pair-timeout` are in seconds.

Terminal results use indented fields and numbered lists. IDs, revisions, preview
tokens, pagination cursors, and snapshot metadata remain visible. Empty lists
are marked explicitly. Partial desktop snapshots produce a warning on stderr.

Successful output automatically uses JSON when piped or redirected. Use `--json`
for the stable `{ "ok", "data" | "error" }` envelope, including runtime errors:

```sh
lunaris --json workspace list | jq '.data.items'
lunaris resource list workspace_123 --limit 20
lunaris resource list workspace_123 --limit 20 --cursor '<nextCursor>'
```

Results go to stdout; errors go to stderr. Argument parsing errors and help use
Clap's standard text format, including with `--json`. MCP uses its own stdio
protocol.

An explicit organization argument takes precedence over `--organization`, then
the saved default. `call --input` requires the complete operation input and does
not fill in organization or idempotency fields.

For updates, read the current entity with `get`, then pass its revision through
`--revision`. For deletion or member removal, run the corresponding preview
command, review its result, and pass its token through `--preview-token`.
Use the same `--idempotency-key` when retrying a mutation; otherwise each typed
mutation command generates a new key.

Exit codes: `0` success, `1` local/configuration errors, `2` other API errors or
invalid arguments, `3` authentication/permission errors, `4` conflict or failed
precondition, and `5` rate limiting.

## Verification

```sh
cargo test --manifest-path crates/agent-mcp/Cargo.toml
cargo test --manifest-path apps/cli/Cargo.toml
bun --cwd internal/agent-contracts test
```

## Distribution notices

Source and binaries use [MIT](LICENSE). Release archives contain
`LICENSE` and `THIRD-PARTY-LICENSES.txt`. Homebrew keeps
both in its package share directory. See the
[release workflow](../../.github/workflows/native.build.yml) for packaging and
[third-party notices](../../THIRD-PARTY-NOTICES.md) for the repository's license
exceptions and outstanding reviews.
