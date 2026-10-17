<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/source/mark-on-dark.svg">
    <img src="assets/brand/source/mark-on-light.svg" alt="Lunaris logo" width="88" height="88">
  </picture>
</p>

<h1 align="center">Lunaris</h1>

<p align="center"><strong>Your writing. Your workspace. Your way.</strong></p>

<p align="center">
  An offline-first word processor for writing, planning, and working together.<br>
  Keep work on your device, collaborate in real time, and add tools as you need them.
</p>

<p align="center">
  Open-source Community Edition with proprietary enterprise features.
  <a href="#license">Licensing details</a>.
</p>

<p align="center">
  <a href="https://web.lunaris.app">Try Lunaris</a> ·
  <a href="https://lunaris.app">Website</a> ·
  <a href="apps/docs/content/index.mdx">Documentation</a> ·
  <a href="#self-host-lunaris">Self-host</a> ·
  <a href="#contributing">Contribute</a>
</p>

[![Lunaris showing a Kanban roadmap and formatted writing side by side](assets/readme/demo.jpg)](https://lunaris.app/watch)

<p align="center">
  <a href="https://lunaris.app/watch"><strong>Watch the 25-second demo</strong></a><br>
  <sub>A silent walkthrough of writing, Kanban boards, drawings, and split views.</sub>
</p>

## A place for ideas to become work

Writing, files, drawings, and tasks in one workspace. Add extensions for the
tools each project needs.

- **Keep writing offline.** Work in Local workspaces on your device, or open synced workspaces online first and keep editing when your connection drops.
- **Write together.** Collaborate in real time in cloud workspaces, share with your team, and control who can edit or view.
- **Make room for your workflow.** Add Kanban boards, drawings, and file previews. Use tabs and split views to keep related work side by side.
- **Choose where work lives.** Keep Local workspaces on one device, sync Private or Shared workspaces, or run your own server.
- **Bring your AI tools.** Connect through MCP with approved access. The desktop preview can also give agents access to Local workspaces.
- **Take your writing with you.** Export to Markdown or PDF, or copy content into another app.

Use Lunaris in a browser, install it as a web app, or try the desktop preview.
See [platform availability](apps/docs/content/reference/platform-availability.mdx)
and [workspace visibility](apps/docs/content/reference/workspace-visibility.mdx)
for storage and sync details.

## Self-host Lunaris

Run Lunaris on one Linux server using prebuilt Docker images:

```sh
curl -fsSL https://lunaris.app/install.sh | bash
```

The installer downloads and verifies the latest stable release into `./lunaris`,
asks for your domain, generates secrets, sets up databases and file storage, runs
migrations, and starts the web app with automatic HTTPS. Requires Docker Compose,
a domain pointing to your server, and open ports 80/443. AMD64 and ARM64 supported.
Allow at least 4 GB RAM. Single server; no high availability.

For unattended installation, pass the public URL:

```sh
curl -fsSL https://lunaris.app/install.sh | bash -s -- https://notes.example.com
```

Already running an HTTPS reverse proxy? Add `--tls-mode external` after
`bash -s --`; Lunaris serves HTTP on localhost port 8080 behind your proxy.

See [self-hosting guide](infra/self-host/README.md) for installation, configuration,
backups, upgrades, and local evaluation. Community Edition is the default;
licensed enterprise builds remain available through the
[edition guide](ee/README.md#build-selection).

## Build on Lunaris

Extensions add resource types, resource views, and workspace tools. Build tools
for your own workflow using the public packages:

| Package | Purpose |
| --- | --- |
| [`@lunarisapp/plugin-sdk`](packages/plugin-sdk) | Extension contracts and host capabilities |
| [`@lunarisapp/ui`](packages/ui) | Shared UI components for Lunaris extensions |

Start with the [extension quickstart](apps/docs/content/developers/extensions/quickstart.mdx),
explore the [bundled extensions](extensions), or
[connect an AI client through MCP](apps/docs/content/developers/mcp.mdx).

## Local development

- Bun 1.4.0, matching the repository's `packageManager` field
- Docker Desktop
- macOS or Linux for local application development
- The pinned Rust toolchain for the desktop app or CLI

From the repository root:

```sh
bun install
bun run services:up
bun run services:init
NODE_ENV=development bun run --filter=api db:migrate
bun run dev
```

Open [localhost:5173](http://localhost:5173). The API runs on port `3000`;
local services use `5432` (PostgreSQL), `8080` (PowerSync), and `3900`/`3903`
(Garage).

Development defaults are committed in `apps/api/.env.development` and
`apps/web/.env.development`. Use gitignored `.env.local` files for personal
overrides. Set `LUNARIS_COMPOSE_ENV` to select a different API env file for Compose.

<details>
<summary><strong>Commands and repository map</strong></summary>

### Useful commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the API and web app |
| `bun run dev:desktop` | Start the Tauri desktop app |
| `bun run dev:docs` | Start the documentation site |
| `bun run dev:landing` | Start the marketing site |
| `bun run services:logs` | View local service logs |
| `bun run services:down` | Stop local services |
| `bun run build` | Build applications and public packages |
| `bun run check` | Run Biome checks |
| `bun run typecheck` | Typecheck workspaces |
| `bun run test` | Run workspace unit tests |
| `cargo test --workspace` | Run Rust workspace tests |
| `bun run e2e` | Run Cypress end-to-end tests |
| `bun run public:validate` | Validate public package builds, types, and fixtures |
| `bun run release:validate` | Check CLI and desktop version synchronization |

### Repository map

App setup: [API](apps/api/README.md), [web](apps/web/README.md),
[desktop](apps/desktop/README.md), [CLI](apps/cli/README.md),
[docs](apps/docs/README.md), [website](apps/landing/README.md),
[E2E tests](apps/e2e/README.md).

```text
apps/               Applications and browser tests
packages/           Public plugin SDK and UI components
internal/           Internal application libraries (@repo/*)
ee/                 Proprietary enterprise features
extensions/         Bundled extensions
crates/agent-mcp/   Shared Rust MCP runtime
infra/              Local services and self-hosting infrastructure
assets/brand/       Brand assets
tooling/            Repository and release tooling
```

Lunaris uses TypeScript and Rust, Bun workspaces, and Turborepo. PowerSync handles
client data sync; Yjs powers collaborative editing. Only `@lunarisapp/plugin-sdk`
and `@lunarisapp/ui` are publishable packages. Cargo uses the root workspace and
lockfile.

</details>

## Contributing

For vulnerabilities, follow the [security policy](SECURITY.md) and report them
privately to [security@lunaris.app](mailto:security@lunaris.app).

Found a bug or have an idea? [Open an issue](https://github.com/LunarisApp/lunaris/issues)
with the problem, expected behavior, and steps to reproduce when relevant.
For a larger change, start with an issue to discuss the approach.

For code changes, read the `AGENTS.md` instructions in the area you are editing,
keep changes focused, and run the relevant checks above. Documentation fixes,
translations, and reproducible bug reports are useful contributions too.

Use `bun changeset` for public API changes and user-visible CLI or desktop changes.
Public packages version independently. Extensions may depend on public Lunaris
packages, declared third-party dependencies, and their own package-local code.

## License

First-party source is licensed under [MIT](LICENSE), except where a
separate license is specified. This is a mixed-license repository:

- **Enterprise Edition:** [`ee/`](ee/README.md) is excluded from MIT
  and uses a separate [proprietary license](ee/LICENSE). Builds default to
  Community Edition; explicitly selecting Enterprise Edition requires the
  applicable permission.
- **Landing website:** `apps/landing` includes Tailwind Plus components and
  templates. Those components, templates, and code or assets derived from them
  are **excluded from MIT** and remain subject to the
  [Tailwind Plus license](apps/landing/LICENSE.md), including after modification.
  They are included as part of the Lunaris website, not offered as a reusable
  template, starter kit, or component library. See the
  [landing licensing notes](apps/landing/README.md#licensing) before reusing them.
- **CLI distribution:** source and binaries use [MIT](apps/cli/LICENSE);
  distributed archives also include dependency notices.
- **Other third-party material:** its own licenses and notices continue to apply.

See [third-party notices](THIRD-PARTY-NOTICES.md) for attribution and release checks.
