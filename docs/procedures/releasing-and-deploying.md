# Release operations

[Trunk delivery and stable releases](independent-delivery.md) is the source of truth
for delivery flow, credentials, migration, stable release recovery, and rollback.
Develop on `main`. Product releases use **Release Stable**; public SDK/UI packages
use Changesets and **Artifacts - Prepare/Publish**.

The old next-to-main preparation, version-commit coordinator, back-merge, hosted
publisher, and standalone native publisher have been removed. Their source remains
in Git history. Do not restore these workflows alongside current publication owners.
Historical release manifests, tags, and assets remain available for recovery.

## GitHub release App

Use a private release App installed on this repository, with **Contents: read/write**
and **Pull requests: read/write**. Set repository variable `RELEASE_APP_ID` and secret
`RELEASE_APP_PRIVATE_KEY`. Workflows mint short-lived installation tokens to open
version PRs and create protected tags. The App cannot bypass main's checks or mutate
existing release tags.

Manage repository protections with the reviewed preview/apply procedure in
[GitHub migration](independent-delivery.md#github-migration). Ruleset names remain
stable so cutover updates existing rules by ID, preserving historical tag protection.

## npm recovery

Packages publish to npmjs.org under `latest`, using OIDC and provenance. Configure
trusted publishing for each public package using the caller workflow
`artifacts.publish.yml`, environment `release`, with direct `npm publish` allowed.
Manual recovery also needs trusted publishing authorization for `packages.publish.yml`.

Run **Packages - Publish** with the original validated release commit:

- Select `npm` for `.release/npm.json` releases.
- Select `legacy` only for historical `.release/manifest.json` releases. Legacy
  recovery still requires the original release commit to be current `main`.

Recovery checks out current tooling separately from the release package tree.
Existing tags must match the validated commit. Each tarball must match registry
integrity before its GitHub Release becomes public. Matching versions are never
republished; missing versions are published. A failed GitHub promotion fails the
job and can be retried without republishing matching bytes.

For new corrections, add a Changeset and publish a new version. Do not move tags,
replace published packages, or modify historical manifests to force recovery.

## Publication status and landing checks

Green branch CI does not mean production deployed. Inspect **Release Stable** for
product publication, **Artifacts - Publish** for npm, and **Sites - Deploy** for
landing/docs. Recover failed jobs while preserving versions, tags, draft releases,
and deployment records.

Landing deployment checks the homepage, `/en/self-hosted`, installer redirect, and
installer asset after its normal health check. Failure leaves the deployment
unsuccessful, so the next run still selects those changes.

Hosted retries reconcile recorded Railway deployment IDs. Unknown upload outcomes
block replay; use the [recovery procedure](independent-delivery.md#recovery).
Root `.railwayignore` excludes agent tooling and collaboration files from source
uploads. Preserve monorepo-root builds and each service's
`apps/<app>/railway.json` path. Database and sync changes must remain compatible
with installed and offline clients; rollback never reverses migrations automatically.

Self-hosted releases verify anonymous image access before publication. Both GHCR
packages must be public. See the [self-hosting guide](../../infra/self-host/README.md)
for installation and upgrades.
