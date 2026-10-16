# Releasing and deploying

`next` is the development branch. `main` contains stable releases. Public packages
and hosted apps version independently through Changesets. Hosted apps have no preview
environments or prereleases. AIO containers use independent semantic versions;
see [AIO publishing](../../infra/all-in-one/README.md#publishing-to-docker-hub).

## Feature and release flow

1. Branch from `next`. Add `bun changeset` entries for each affected release target:
   `@lunarisapp/plugin-sdk`, `@lunarisapp/ui`, `api`, `web`, `docs`, or `landing`.
   CI follows workspace dependencies, including private libraries. Lockfile/root
   build configuration changes require entries for all six targets. Tests and
   repository README/AGENTS/CHANGELOG edits alone need no Changeset; docs-site
   content does. Changes to PowerSync configuration require an API Changeset.
2. Open a PR into `next` and squash merge after CI/code-owner review.
3. `Release - Prepare` creates one draft `next` to `main` PR. Its body previews
   Changesets versions and changelogs without committing bumps to `next`. Updates
   preserve its draft/ready state. Keep it draft while accumulating changes.
4. Mark the PR ready for review when preparing a release. Full E2E runs on that
   revision and every subsequent update; superseded PR runs are cancelled. Wait
   for CI on the latest revision, then merge with a **merge commit**. This is the
   release approval: npm publication and Railway production deployment follow automatically.
5. `Release - Publish` consumes only the six allowed targets' Changesets, commits
   versions, changelogs, lockfile updates, and `.release/manifest.json` to `main`.
   CLI/Desktop entries, including entries in mixed Changesets, remain pending.
6. CI checks that exact version commit, including E2E. Only then does automation
   create immutable `<package>@<version>` tags and draft GitHub Releases.
7. Independent jobs publish npm packages and deploy hosted apps. Back-merge runs
   after tagging, independently of downstream publication jobs. Each npm release
   becomes public after its registry integrity matches. Each hosted release becomes
   public after all its destinations and health checks succeed (including the API's
   existing sync configuration step). Failed or unattempted targets stay draft;
   already verified targets remain public. The workflow result still reports
   publication and back-merge failures.

Feature PRs into `next`, draft release PRs, and ordinary branch pushes run CI
without full E2E. Ready PRs into `main`, including hotfixes, require E2E success.
Nightly E2E is disabled; dispatch `E2E` manually on a selected branch when needed.
The final version commit still runs full E2E before publication.

Npm packages publish to npmjs.org under `latest`, using OIDC and provenance.
Already-published versions are accepted only when their tarball integrity matches.
No existing npm version is overwritten.

Railway receives the exact version commit through a CLI upload, using each
service's existing `railway.json`. Every configured API destination deploys first,
including its pre-deploy migration hook; PowerSync configuration deploys next;
web, docs, and landing follow. Only changed/versioned apps deploy. Migration,
PowerSync, deployment, or health-check failures stop dependent client deployments.
Schemas and sync rules must remain compatible with installed/offline clients:
use additive changes first, then retire old behavior in a later release.

## Hotfix and back-merge

Branch `hotfix/<name>` from `main`, add patch-only Changesets, and open a PR into
`main`. Merge with a merge commit. Normal release automation runs, then merges
`main` back into `next`. Hotfixes support current stable versions only.

Back-merges fast-forward where possible; otherwise they create a merge commit.
Conflicts open `back-merge/<full-sha>` into `next`. Resolve conflicts there and
**merge**, never squash. A designated code owner uses the PR-only ruleset bypass
for this recovery merge (normal feature PRs require squash); CI remains mandatory.
Preserve pending changesets and released versions.
Concurrent updates to `next` reject the push rather than overwriting changes;
rerun the back-merge job after fetching current state.

## One-time setup

Release preparation, publishing, and release-source/Changeset PR enforcement
are enabled by default. Complete credentials and destinations before merging
release changes into `main`. Workflows do not switch remote branches or disable
Railway branch auto-deploy sources; configure those separately to avoid duplicate
production deployments.

### GitHub release App (recommended)

Create a private **Lunaris Release** App under the LunarisApp organization:

- Homepage: this repository; disable webhooks; no callback URL/server needed.
- Repository permissions: **Contents: read/write**, **Pull requests: read/write**.
- Install on **LunarisApp/lunaris only**.
- Set repository variable `RELEASE_APP_ID` to the App's numeric ID.
- Generate a private key and store it directly in repository secret
  `RELEASE_APP_PRIVATE_KEY`. Never commit or paste it into an issue.

Workflows mint short-lived installation tokens. These can create PRs and trigger
follow-on CI when version commits are pushed. The App is the only bypass actor
for automated branch writes; branch/tag immutability rules have no bypass.

### npm

Configure a GitHub trusted publisher on **each** public package:
`LunarisApp` / `lunaris`, workflow **`release.publish.yml`**, environment **`release`**,
with direct `npm publish` allowed. The caller workflow is used for reusable
workflow validation. No npm token is required. If a package has never been
published, complete its initial npm ownership/bootstrap setup before activation.
Use Node 24 and an npm CLI supporting trusted publishing (11.5.1 or newer).
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

### Railway

Create GitHub environment `production`, restricted to `main`, without an extra
routine reviewer gate. Store a Railway account/workspace API token with access to
both production projects as environment secret `RAILWAY_RELEASE_TOKEN`. Workflow
passes this as `RAILWAY_API_TOKEN`; a single-project `RAILWAY_TOKEN` cannot address
both projects. Create environment `release`, also restricted to `main`, for npm.

Set environment variable `RAILWAY_RELEASE_TARGETS` to this shape, using verified
IDs and public HTTPS health URLs (multiple API regions can be listed):

```json
{
  "api": [{ "project": "PROJECT_UUID", "environment": "ENVIRONMENT_UUID", "service": "SERVICE_UUID", "healthUrl": "https://api.example.com/v1/health" }],
  "web": [{ "project": "PROJECT_UUID", "environment": "ENVIRONMENT_UUID", "service": "SERVICE_UUID", "healthUrl": "https://app.example.com/health" }],
  "docs": [{ "project": "PROJECT_UUID", "environment": "ENVIRONMENT_UUID", "service": "SERVICE_UUID", "healthUrl": "https://docs.example.com/health" }],
  "landing": [{ "project": "PROJECT_UUID", "environment": "ENVIRONMENT_UUID", "service": "SERVICE_UUID", "healthUrl": "https://example.com/health" }]
}
```

Keep existing `POWERSYNC_*` repository variables configured. Railway services must
retain monorepo-root builds and their correct `apps/<app>/railway.json` config
paths when disconnecting GitHub sources. API migrations run through that config.

### Rulesets and cutover

1. Merge these workflows into `main` with automation disabled. Retire any stale
   Changesets version PR; retain its useful changesets. The old native workflow
   no longer owns a version PR and is manual-only.
2. Create `next` from the resulting `main`, without renaming an existing workspace
   branch. Enable CodeQL default setup and wait for its first passing scan.
3. Create a maintainer team containing the code owners who may bypass PR reviews.
   Generate reviewable ruleset JSON with:

   ```sh
   bun tooling/release/automation/rulesets.ts APP_ID MAINTAINER_TEAM_ID > /tmp/lunaris-rulesets.json
   ```

   Apply each object through GitHub's repository rulesets API/settings. The six
   rulesets protect branch history, require `CI` and CodeQL, require PR/review
   policies per branch, restrict stable tag creation, and prohibit tag mutation.
   Team bypass is PR-only; it does not bypass CI. App bypass does not permit
   force-pushing/deleting branches or changing/deleting release tags. Native
   CLI/Desktop tags are outside this rollout's tag scope.
4. Verify rulesets are active and supported by the GitHub plan. Enable merge and
   squash methods; disable rebase. Make `next` default only after protections exist.
5. Confirm App, npm trust, environments, credentials, destinations, and health
   URLs. Disable GitHub auto-deploy triggers for API/web/docs/landing in Railway,
   preserving build/start/config settings. PowerSync deploys through the hosted-app
   release workflow; there is no independent PowerSync push workflow.
6. Dispatch `Release - Prepare` on `next` if it already contains unreleased work.
   Review the first release PR carefully: setup does not publish existing package
   versions automatically; versions must be advanced with Changesets.

Lunaris Release was created with App ID `5335382` and installation
ID `171839628`, scoped only to `LunarisApp/lunaris`. Contents and Pull requests
have read/write access; Metadata has mandatory read access. `RELEASE_APP_ID` and
`RELEASE_APP_PRIVATE_KEY` are configured in repository Actions settings. Private
key authentication and a temporary installation token were verified; that token
was revoked after verification. The remaining setup requirements are listed above.

### Applied protections (2026-10-15)

CodeQL is configured. All six generated rulesets are active on the repository:
branch history `25189787`, required checks `25189790`, main PRs `25189792`,
next PRs `25189793`, tag creation `25189795`, and tag immutability `25189796`.
The `release-maintainers` team (ID `20126107`) contains only `MrLightful` and has
repository write access. Its bypass is PR-only and does not bypass CI/CodeQL.
Required CI is bound to the GitHub Actions integration (`15368`). New commits
dismiss stale approvals. The release App can bypass checks and PR rules for
version commits and automatic back-merges; immutable-history rules have no bypass.

Bootstrap PR #2 required aggregate CI before merge and creation of `next`.
Release-source/Changeset policy enforcement now runs on every PR.

### Historical setup snapshot (2026-10-15)

At this snapshot, publication was held, no `RAILWAY_RELEASE_TOKEN` had been
created, and Railway branch auto-deploys remained configured. The workflow
activation flag has since been removed; verify credentials and branch triggers
before the first production release.
The `release` and `production` GitHub environments accept only `main`, with no
extra reviewer gate. `RAILWAY_RELEASE_TARGETS` contains verified production
project/service IDs and health URLs for API, web, docs, and landing.

Both npm packages have trusted publishing configured for `LunarisApp/lunaris`,
`release.publish.yml`, environment `release`, including direct `npm publish`.
Their first publication still must validate those connections: SDK before
2026-10-17 19:14 UTC; UI before 2026-10-17 19:16 UTC. If activation happens later,
recheck and renew npm trust before publishing. Do not publish merely to preserve
these validation windows.

## Failures, retries, and rollback

- Rerun the release run, or dispatch `Release - Publish` on current `main`.
  An existing version commit resumes its manifest without another version bump.
  Tags must resolve to that exact commit. Superseded releases fail closed; do not
  promote an older version over newer production with a stale workflow run.
- Complete/reconcile a failed release before merging another release PR. GitHub
  concurrency serializes running releases but can replace pending runs; it is not
  a durable release queue. Feature work may continue on `next`.
- npm publishes are immutable. If one package succeeds and another fails, retry
  verifies successful tarball integrity and publishes only missing versions.
  Verification also promotes that package's GitHub Release, including on recovery
  runs. A failed GitHub promotion fails the job; rerunning retries promotion without
  republishing matching npm versions.
- Railway receipts are attached to GitHub Releases per service. They record source
  SHA and every deployment ID. Retries resume known deployments; failed/crashed
  deployments may be retried. An upload intent without an ID means an uncertain
  upload: inspect Railway history and repair that receipt before retrying. Never
  blindly repeat an uncertain upload. Workflow summaries record smoke-check URLs.
- A stale/missing deployment receipt or a deployment removed from history needs
  operator reconciliation. Do not delete receipts to force a retry.
- Rollback: redeploy a recorded known-good Railway deployment only after verifying
  database compatibility. Do not automatically reverse migrations. Otherwise ship
  a patch hotfix. npm corrections always get a new version.

CLI/Desktop releases remain separate manual invocations of `Native - Publish`;
their version edits and Cargo/Tauri synchronization remain an explicit native
release task. This coordinator neither consumes their changesets nor publishes
their artifacts.

Separate Community Docker images follow the existing API/web release versions:
`api@<version>` publishes `lunarisapp/lunaris-api`, and `web@<version>` publishes
`lunarisapp/lunaris-web`. See [Docker images](../../infra/images/README.md) for
runtime configuration, migration commands, tag policy and publication recovery.
