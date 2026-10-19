# 0007: Run managed production infrastructure on Railway

- Status: Accepted
- Date: 2026-10-14

## Context

Lunaris uses Railway for its managed production infrastructure. Application builds
and startup behavior need to stay aligned with source changes, but operating the
production environment is a separate concern from maintaining this repository.

The repository contains app-level `railway.json` files for the API, web app,
documentation site, and landing page. These describe how to build and run those
apps; they are not a complete description of the production infrastructure.

## Decision

Use Railway for managed production hosting. Manage the overall production
infrastructure outside this repository, including service topology, provisioning,
regions, networking, domains, secrets, capacity, backups, and operational access.

Keep the existing app-level `railway.json` files in the repository. Build and start
commands, migration hooks, health checks, and related deployment settings belong
alongside the code they depend on. Update them when application changes require it.
Their presence does not make this repository the source of truth for the full
Railway environment.

Keep application configuration and service contracts explicit without coupling
product behavior to Railway. Local development and self-hosting remain repository
concerns through `infra/local` and `infra/self-host`; they do not need to reproduce
the managed production topology. Regional discovery continues to follow
[ADR 0006](0006-regions-and-server-discovery.md).

## Alternatives considered

- **Describe all production infrastructure in this repository:** couples product
  maintenance to the managed service's operational topology and lifecycle.
- **Keep all Railway configuration outside the repository:** separates build and
  runtime settings from the application changes that require them.
- **Require Railway for every deployment:** unnecessarily constrains local
  development and self-hosting.

## Consequences

Contributors can maintain and run Lunaris without managing its production
infrastructure. App deployment settings remain reviewable with code changes,
while operators can evolve the Railway environment independently.

A checkout alone cannot reconstruct managed production. Operators must maintain
operational records and recovery procedures outside this repository and coordinate
infrastructure changes with application configuration, migrations, and discovery.
Railway-specific deployment settings also need revisiting if the hosting provider
changes.

## References

- [API deployment configuration](../../apps/api/railway.json)
- [Web deployment configuration](../../apps/web/railway.json)
- [Documentation site deployment configuration](../../apps/docs/railway.json)
- [Landing page deployment configuration](../../apps/landing/railway.json)
- [Local development services](../../infra/local/compose.yaml)
- [Self-hosted deployment](../../infra/self-host/README.md)
- [Regions and server discovery](0006-regions-and-server-discovery.md)
