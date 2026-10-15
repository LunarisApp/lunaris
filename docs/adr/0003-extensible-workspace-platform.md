# 0003: Build an extensible workspace with Cordis

- Status: Accepted
- Date: 2026-10-14

## Context

Users need different combinations of writing, planning, drawing, file review,
and specialized tools. Putting every interaction in core would make Lunaris
harder to maintain while still leaving some workflows unsupported.

We want an open platform where contributors can add tools and users can choose
what their workspace needs. Extensions should reuse storage, navigation,
permissions, and collaboration instead of rebuilding them.

## Decision

Define extensions through the public `@lunarisapp/plugin-sdk`. Use a private
Cordis-backed runtime for their lifecycle and the workspace host to integrate
their contributions.

### Extend the workspace through public contracts

Extensions can add resource types, resource views, standalone views, resource
commands, search indexers and queries, services, and contributions to declared
extension points.

Bundled features such as rich text, files, boards, and drawings use this model
too. Their code uses the public SDK and UI packages, not private host libraries
or another extension's implementation.

The host owns shared workspace behavior and permission checks. Not every
application feature needs to be an extension. New kinds of interaction may need
new SDK capabilities rather than unrestricted access to host internals.

### Separate content from its interface

Follow the resource model in [ADR 0001](0001-resources.md). Resource types define
data schemas and named storage slots; resource views declare which contracts and
slots they can use. Different extensions can provide compatible views of the
same resource without copying its data.

The host manages Yjs, key-value, and file storage through scoped handles, building
on [ADR 0002](0002-offline-first.md). External-service features may still require
a connection. Standalone views support tools that need no saved resource.

### Use Cordis for lifecycle and dependencies

Inside `@repo/plugin-runtime`, Cordis contexts, services, and effects manage
activation, dependency availability, and cleanup. Lunaris adds contribution
registration, version and conflict checks, and diagnostics.

An extension waits when a required dependency is missing or incompatible.
Dependents unload when that service disappears and can activate when a compatible
one returns. Failed activation triggers cleanup; disabling an extension removes
its runtime contributions while preserving durable data.

Keep Cordis behind the SDK so extension authors depend on Lunaris's public
contract rather than its runtime framework. The host registers and removes the
contributions produced by that runtime.

Cordis does not isolate untrusted code. External extensions use the host sandbox
and capability checks; bundled extensions run as trusted code in the application.
Detailed sandbox and storage policies belong in separate ADRs.

## Alternatives considered

- **Build every interaction in core:** ties specialized workflows to core releases
  and couples unrelated features.
- **Use a static registry and custom lifecycle code:** requires us to build the
  dependency, cleanup, and recovery machinery that Cordis provides.
- **Bind each resource to one editor:** prevents alternative interfaces from
  sharing its data.
- **Expose private internals:** makes extensions fragile and access harder to control.

## Consequences

Contributors can add supported interactions without changing core. Users gain
more ways to work with the same content, and bundled extensions exercise the
public API.

The SDK needs versioning, migration guidance, documentation, and consumer tests.
The host must explain dependency failures and preserve content when an extension
is unavailable. Cordis adds an upstream dependency; sandbox messaging adds cost
and limits. Shared components and contracts help consistency, but extension
authors still need to deliver accessible, performant interfaces.

## References

- [Public SDK](../../packages/plugin-sdk/README.md)
- [Resources](../../packages/plugin-sdk/docs/resources.md)
- [Views](../../packages/plugin-sdk/docs/views.md)
- [Storage](../../packages/plugin-sdk/docs/storage.md)
- [Cordis-backed runtime](../../internal/plugin-runtime/src/index.ts)
- [Runtime lifecycle tests](../../internal/plugin-runtime/src/index.test.ts)
- [Workspace contribution lifecycle](../../internal/workspaces/src/extensions/host/lifecycle.ts)
- [Bundled extension boundaries](../../extensions/AGENTS.md)
- [External extension sandbox](../../packages/plugin-sdk/docs/sandbox-security.md)
