# Trunk delivery and stable releases

Develop on `main`. Feature PRs use squash merges after aggregate `CI`, CodeQL,
and code-owner review. Product changes need no Changeset. Public SDK/UI changes
still need Changesets and publish independently through npm version PRs.

GitHub workflow enable/disable controls pause publication during migration.
Legacy release entrypoints stay retired; no delivery mode variable is needed.
Never enable two deployment owners for one Railway service.

## Delivery flow

- **Sites - Deploy** independently validates and deploys changed landing/docs on
  main merges. Selection compares against last successful deployment so failed
  changes remain pending. Sites do not wait for stable releases.
- **Core - Candidate** builds private EE API/web images when core, native, or
  self-hosted inputs change. Unchanged hosted images reuse tested digests. Three
  Cypress shards test candidate images; successful candidates deploy isolated
  staging and retain source, digests, sync/configuration revisions, and staging
  evidence for 30 days.
- **Release Stable** runs manually on main. Supply successful candidate run ID;
  optional version overrides next product patch. Initial version exceeds the
  highest historical product-component version, excluding SDK/UI.
- Every stable builds CLI, desktop, and CE self-hosted outputs from selected
  candidate source. Native builds retain signing/notarization policy. CE runs
  installer checks on AMD64/ARM64 before pushing digest-pinned images.
- Only after artifact validation does stable promote tested hosted digests.
  API regions finish migrations and health checks, then PowerSync updates, then
  web deploys. Existing migration advisory locks support parallel API destinations.
- Native S3 distribution and Homebrew updates follow hosted success. One `vX.Y.Z`
  GitHub Release becomes public after every output succeeds. Its assets include
  installers, native archives, checksums, and `release-manifest.json`.

The tag identifies selected source, without a version commit or back-merge.
Native/CE versions and lockfile metadata are generated in isolated build checkouts.
Hosted images retain their source identity; manifest associates digests with stable
version. Full source CI must already pass on candidate SHA. No full CI rerun is
introduced solely for generated release metadata.

## Recovery

Stable reserves version, source, candidate and staging evidence in immutable
`release-plan.json` on a draft GitHub Release. All stable runs serialize. A retry
with same candidate resumes reserved version; another candidate/version is refused
until incomplete publication is resolved. Re-dispatching a completed candidate
is a no-op.

Artifact receipts bind source/version to checksums. Successful builds download
persisted assets rather than rebuild; interrupted uploads can recover from the
producer run's Actions artifacts. Existing differing bytes are never overwritten.
Do not delete recovery assets or rerun after artifact retention expires without
reviewing incomplete publication.

Hosted service attempts use GitHub deployment records with Railway deployment IDs.
Retries reuse successful destinations and reconcile known pending provider runs.
Unknown provider outcomes block replay. After inspecting Railway, use:

```sh
bun tooling/delivery/reconcile.ts <github-service-deployment-id> <railway-deployment-id>
```

**Core - Promote** manual dispatch is rollback-only. Supply prior successful
production deployment ID and leave candidate ID empty. Normal promotion belongs
exclusively to Release Stable. Rollback does not reverse database migrations;
unresolved sync/configuration changes require forward recovery. Keep schema and
sync changes compatible with installed/offline clients.

## GitHub migration

First provision isolated Railway staging with its own database, Redis, storage,
PowerSync, API and web. Configure private GHCR reads for hosted EE images in
staging/production. Disable provider auto-updates and duplicate GitHub autodeploys.
Production must not share staging state.

Required GitHub environments: `staging`, `production`, `release`. Configure
`RAILWAY_STAGING_TARGETS` / `RAILWAY_RELEASE_TARGETS` using existing destination
schema and environment-scoped `RAILWAY_RELEASE_TOKEN`. Staging requires its own
`STAGING_POWERSYNC_{PROJECT_ID,ENVIRONMENT_ID,API_SERVICE_ID,COMPACT_SERVICE_ID,REPLICATION_SERVICE_ID}`.
Retain production `POWERSYNC_*`. Set repository `CORE_CONFIGURATION_REVISION`
and increment it when runtime settings/destinations need recertification.

Configure native S3 and Homebrew credentials used by existing release scripts.
Apple credentials remain all-or-none: absent credentials select ad-hoc signing;
partial credentials fail. Native build jobs read repository secrets; distribution
jobs also support release-environment secrets. Configure npm trusted publishers
for `artifacts.publish.yml`, environment `release`, and verify release App access.

Preview from this workspace:

```sh
RELEASE_MAINTAINER_TEAM_ID=<verified-team-id> bun tooling/delivery/cutover.ts
```

Preview reads remote settings and saves `.context/release-cutover/before.json`
without secret values. It never changes GitHub. Apply retains original snapshot
across retries and pauses publication before mutations; blockers leave it paused.

Drain legacy publications and draft releases, then reconcile next into main while
delivery workflows are disabled. Merge implementation before applying settings from clean
current main:

```sh
RELEASE_MAINTAINER_TEAM_ID=<verified-team-id> bun tooling/delivery/cutover.ts --apply
```

Cutover updates existing rulesets by ID, protects unified and historical tags,
requires CI/CodeQL without branch-write bypass, sets main default, retargets feature
PRs, restricts environments to main, freezes next, and selects squash-only merges.
Maintainer team retains PR-only bypass; release App creates protected tags and opens
npm version PRs without bypassing checks. Unrelated rules/settings remain intact.
Inherited active rules require explicit review rather than automatic modification.
Every changed policy is read back; failures retain paused publication.

Settings alone do not prove staging or publication. Complete isolated release
rehearsal and verify npm trust; rerun with `RELEASE_REHEARSAL_VERIFIED=true` only
when that evidence exists. This enables delivery workflows last. Keep original snapshots and
historical release records for recovery.

## Validation and measurement

```sh
bun run check
bun run tooling:typecheck
bun test tooling/ci tooling/ci-selection.test.ts tooling/release tooling/delivery tooling/self-host
```

Use Actionlint for workflow semantics. Check deployed source SHA and provider
terminal status, not only green CI. Measure candidate readiness, stable packaging,
and hosted promotion separately. Warm hosted promotion target: five minutes,
excluding migrations/provider queues; native packaging needs measured baseline.
