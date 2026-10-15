# Extension Development Guide

## Package Boundary

Each built-in extension lives in its own workspace package:

```
extensions/{extension-slug}/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    manifest.json
    descriptor.ts
    index.tsx
    mcp.ts
    mcp-contract.ts
    mcp-runtime.ts
    locales/
```

Package names use `@extension/{extension-slug}`. Runtime extension IDs stay `lunaris.*`.

## Allowed Imports

Extension source under `extensions/{slug}/src/**` may import only:

- local files inside the same extension package
- `@lunarisapp/plugin-sdk`, `@lunarisapp/plugin-sdk/data`, `@lunarisapp/plugin-sdk/mcp`, `@lunarisapp/plugin-sdk/time`, `@lunarisapp/plugin-sdk/worker`
- `@lunarisapp/ui/*`
- third-party packages declared by that extension package
- package-local `@extension/{slug}` imports if needed

Forbidden:

- every `@repo/*` package
- imports from another `@extension/*` package

`internal/workspaces/src/extensions/registry.test.ts` enforces this.

## Bundled Registry

`internal/workspaces/src/extensions/registry.ts` owns the bundled extension registry.
The private host lives in `internal/workspaces/src/extensions/host`:

- registry imports only `@extension/*/descriptor`
- each descriptor owns its lazy `import("./index")`
- app code imports the local registry module

Do not put extension implementation code inside the app registry.

Rich Text owns its direct PDF renderer under `extensions/rich-text/src/pdf`.

Built-in MCP capabilities belong in `mcp.ts`. Keep declarations runtime-neutral.
Extension-owned procedures expose schemas in `mcp-contract.ts` and pure document
logic in `mcp-runtime.ts`; API and Desktop hosts own authorization, persistence,
idempotency, and transport.
