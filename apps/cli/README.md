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
lunaris resource search "roadmap" --workspace workspace_123
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

List available operation names, descriptions, and required scopes without signing
in, then call an operation directly:

```sh
lunaris call --list
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
lunaris resource list --workspace workspace_123 --limit 20
lunaris resource list --workspace workspace_123 --limit 20 --cursor '<nextCursor>'
```

Results go to stdout; errors go to stderr. Argument parsing errors and help use
Clap's standard text format, including with `--json`. MCP uses its own stdio
protocol.

Use `--organization` to override the saved default. Organization `get` and
`update` also accept the target organization as a positional argument, which
takes precedence over `--organization`. `call --input` requires the complete operation input and does
not fill in organization or idempotency fields.

For updates, read the current entity with `get`, then pass its revision through
`--revision`. For deletion or member removal, use `--preview`, review its result,
then invoke the same command with `--preview-token`. Exactly one mode is required;
a bare delete or removal command returns usage guidance without making a request.
Use the same `--idempotency-key` when retrying a mutation; otherwise each typed
mutation command generates a new key.

Exit codes: `0` success, `1` local/configuration errors, `2` other API errors or
invalid arguments, `3` authentication/permission errors, `4` conflict or failed
precondition, and `5` rate limiting.

## Command structure

Positional arguments identify the target; flags select its scope:

```sh
lunaris workspace get workspace_123 --organization organization_123
lunaris resource get resource_123 --workspace workspace_123
lunaris resource create "Roadmap" --workspace workspace_123 --resource-type-id TYPE_ID
lunaris storage yjs json storage_123 --workspace workspace_123
lunaris storage yjs state storage_123 --workspace workspace_123
lunaris storage kv list storage_123 --workspace workspace_123
lunaris storage file download-url storage_123 --workspace workspace_123
```

Preview and apply use the same command name:

```sh
lunaris resource delete resource_123 --workspace workspace_123 --preview
lunaris resource delete resource_123 --workspace workspace_123 --preview-token TOKEN
lunaris workspace delete workspace_123 --preview
lunaris workspace delete workspace_123 --preview-token TOKEN
lunaris organization remove-member member_123 --preview
lunaris organization remove-member member_123 --preview-token TOKEN
```

### Migrating existing scripts

- Resource and storage commands now require `--workspace ID` instead of a
  positional workspace ID. Move the old first argument into this flag; leave
  the resource or storage ID positional. Search still allows organization-wide
  queries without a workspace flag.
- Use `--organization ID` for organization scope. Legacy positional organization
  scope remains accepted as a deprecated fallback and retains precedence over
  the flag, but is hidden from help.
- `--workspace-id` remains a deprecated alias for `--workspace`.
- `yjs-storage`, `key-value-storage`, and `file` remain hidden deprecated command
  names for `storage yjs`, `storage kv`, and `storage file`. They also require the
  new workspace flag syntax.
- `preview-delete` and `preview-remove-member` remain hidden deprecated commands.
  Prefer `delete --preview` and `remove-member --preview`.
- Raw `call OPERATION --input JSON` and JSON response envelopes are unchanged.

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
