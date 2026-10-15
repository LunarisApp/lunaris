# @lunarisapp/plugin-sdk

TypeScript and React SDK for adding resource types, resource views, and workspace
tools to Lunaris. Start with the
[extension quickstart](../../apps/docs/content/developers/extensions/quickstart.mdx)
and [SDK development guide](docs/getting-started.md).

## Installation

```sh
bun add @lunarisapp/plugin-sdk react yjs
bun add -d vite typescript
```

Match the peer dependencies in [package.json](package.json). Vite powers the
extension build helper.

## Entry points

| Import | Purpose |
| --- | --- |
| `@lunarisapp/plugin-sdk` | Extension registration, contracts, and React integration |
| `@lunarisapp/plugin-sdk/data` | Resource data APIs |
| `@lunarisapp/plugin-sdk/time` | Time helpers |
| `@lunarisapp/plugin-sdk/worker` | One-shot worker tasks |
| `@lunarisapp/plugin-sdk/mcp` | MCP contracts |
| `@lunarisapp/plugin-sdk/marketplace` | Marketplace metadata and validation |
| `@lunarisapp/plugin-sdk/vite` | Node-only extension build tooling |

`/sandbox` is a host build runtime; `/internal` is reserved for the official
Lunaris host and has no public semantic-versioning guarantee. Extension
implementation code must not import these paths, `@repo/*`, or `@extension/*`.

## Build an extension

Community extensions can call `usePluginFetch()` for unauthenticated HTTPS
requests. Browser extensions remain subject to CORS; desktop uses the native HTTP
transport. Credentials default to `omit` on both platforms.

Extension repositories build through standard Vite configuration:

```ts
import { defineLunarisPluginConfig } from "@lunarisapp/plugin-sdk/vite";

export default defineLunarisPluginConfig();
```

Running `vite build` emits the normalized manifest and self-contained sandbox
IIFE expected by Lunaris. The helper enforces import boundaries, asset limits,
and release-tag compatibility. An optional root-level `icon.<extension>` file
may use any detectable raster format, including PNG, WebP, JPEG, GIF, and AVIF;
the build validates it and preserves its extension. Catalog extensions run in opaque-origin iframes;
see [sandbox security](docs/sandbox-security.md).

Use `runPluginWorkerTask` and `exposePluginWorkerTask` from the `/worker`
entry point for one-shot CPU-heavy work. External extensions must import their
dedicated worker with Vite's `?worker&inline` query so the release remains one
hash-pinned script.

## Storage and compatibility

Resources compose named Yjs, key-value, and single-file slots. Views
declare only the subset they consume. See [storage](docs/storage.md),
[resources](docs/resources.md), [views](docs/views.md), and the
[0.9 migration guide](docs/migrating-to-0.9.md).

Protocol 7, incremental Yjs hydration, and chunked downloads are documented in
the [API 0.10 / SDK 0.11 migration guide](docs/migrating-to-0.10.md).

See the [API reference](docs/api-reference.md) for contracts. Declare the host API
compatibility required by your extension in its manifest; consult the migration
guides when changing that requirement.

## Contributing to the SDK

From the Lunaris repository root:

```sh
bun install
bun run build --filter=@lunarisapp/plugin-sdk
bun run --cwd packages/plugin-sdk typecheck
bun run --cwd packages/plugin-sdk test
bun run public:validate
```

`public:validate` checks builds and consumer fixtures. Include a changeset and
compatibility tests for public contract changes.

## License

Lunaris-owned SDK code uses [Apache-2.0](LICENSE). Dependencies retain their own
terms; see [third-party notices](../../THIRD-PARTY-NOTICES.md).
