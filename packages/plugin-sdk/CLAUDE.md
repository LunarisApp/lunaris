# Extension SDK boundary

This package is published publicly as `@lunarisapp/plugin-sdk`.

- Supported entry points: `.`, `./catalog`, `./data`, `./mcp`,
  `./time`, and `./vite`.
- `./internal` exists only for the official app-shell host. It is undocumented and semver-exempt.
- SDK source must not import any private `@repo/*` package.
- Extensions receive semantic hooks/capabilities, never SQL or host implementation contexts.
- Static definitions and descriptors are the only supported extension integration model.

The official host bridge, registries, lifecycle, and telemetry live in
`internal/workspaces/src/extensions/host`. Direct Rich Text PDF rendering is
owned by `extensions/rich-text/src/pdf`.
