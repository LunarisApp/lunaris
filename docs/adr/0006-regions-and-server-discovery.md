# 0006: Discover and select regional servers

- Status: Accepted
- Date: 2026-10-14

## Context

Organizations have different requirements for where data is processed and stored.
EU and US compliance expectations, contracts, and customer policies are the main
reason for regional deployments. Lower latency is an additional benefit.

Clients also need to find the right services for managed and self-hosted servers.
Hardcoding every API, sync, and storage address would tie client releases to
infrastructure changes. Asking users to enter each address would be error-prone.

## Decision

Let users select a deployment and discover its configuration through public
directories and manifests. Keep the client separate from the backend it uses.

### Keep the selected region explicit

Use stable region identities. Connect to the selected deployment without silently
switching regions during an outage. Selecting another deployment does not migrate
an account or organization.

Regions allow different operating policies, but a label alone proves neither
compliance nor data residency. Infrastructure, backups, integrations, and operating
practices must match the deployment's stated commitments.

### Discover configuration in two steps

1. A **directory** lists server choices and links to their manifests. Region
   selection uses `/.well-known/lunaris-regions`; CLI and desktop login discovery
   use `/.well-known/lunaris-servers`.
2. A **manifest**, served at `/v1/manifest`, describes the selected deployment's
   identity, service endpoints, and capabilities.

Planned deployments are not connection targets. Validate responses and expected
identities before connecting. Discovery is public; region probing sends no login
credentials. Authentication and user permissions remain separate from discovery.

Cache validated configuration where supported to handle temporary discovery
outages. A cached manifest does not make undownloaded content available offline;
see [ADR 0002](0002-offline-first.md).

### Support self-hosted discovery

The all-in-one deployment publishes both directories and its manifest using
`PUBLIC_URL`. Clients with custom-server support can resolve those endpoints
without assuming an official Lunaris backend. Managed and self-hosted deployments
can use the same discovery contracts while offering different capabilities.

Keep connections, credentials, and local data separate by deployment and user.
Desktop database names currently include region and user identity, and HTTP
sessions are tied to API origins. Switching servers must not reuse another
server's credentials or treat its cached resources as belonging to the new one.

### Future: custom channels in the managed web app

The managed web app may later support **custom channels**: selectable connections
to users' own Lunaris servers. The managed site would supply the interface while
the custom server provides backend services. These are server connections, not
software release channels.

This is not currently supported. It needs further work on trusted origins,
browser cross-origin and content-security rules, authentication, compatibility,
and isolation of credentials and local data. Custom servers can reuse region IDs,
so region ID alone cannot identify a server safely.

Discovery provides a foundation, not automatic trust. The privacy implications
of using the managed frontend with a custom backend also need to be defined
before launch.

## Alternatives considered

- **One global backend:** limits regional choice.
- **Choose the nearest server:** optimizes proximity, not organizational policy.
- **Hardcode endpoints:** couples infrastructure changes to client releases.
- **Configure every URL manually:** risks mixing services from different deployments.
- **Build a client per deployment:** adds distribution work and limits client reuse.

## Consequences

Regional choice supports different customer requirements. Manifests let endpoints
change without hardcoding them in clients, and the same discovery model supports
self-hosting and future custom connections.

Multiple deployments add operational and support costs. Discovery needs validation
and outage handling across clients. Users must choose the correct server, and data
migration requires an explicit process. Custom managed-web channels need further
security and browser integration work.

## References

- [Discovery directory design](../../apps/landing/docs/region-discovery.md)
- [Web region selection and manifest validation](../../internal/features/src/region/index.tsx)
- [Public manifest endpoint](../../apps/api/src/manifest/manifest.controller.ts)
- [Manifest schema](../../apps/api/src/manifest/manifest.schema.ts)
- [CLI server discovery](../../apps/cli/src/discovery.rs)
- [Desktop server discovery](../../apps/desktop/src/agent-client/server-discovery.ts)
- [Desktop storage scope](../../apps/desktop/src/powersync-storage.ts)
- [Self-hosted discovery and configuration](../../infra/all-in-one/README.md)
