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

Output is pretty JSON. Use `--json` for the stable
`{ "ok", "data" | "error" }` envelope.

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
[release workflow](../../.github/workflows/release.yml) for packaging and
[third-party notices](../../THIRD-PARTY-NOTICES.md) for the repository's license
exceptions and outstanding reviews.
