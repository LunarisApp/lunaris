# GitHub workflows

See [trunk delivery and stable releases](../../docs/procedures/independent-delivery.md)
for current architecture, migration, credentials and recovery.

- CI gates feature PRs with affected checks and CodeQL.
- Core - Candidate certifies private staging images after main merges.
- Release Stable selects a candidate, builds all installable outputs, promotes
  hosted digests, and publishes one product release.
- Native - Build stable artifacts is reusable by the stable coordinator.
- Core - Promote manual dispatch provides explicit rollback only.
- Sites - Deploy independently deploys landing/docs after successful checks.
- Artifacts - Prepare/Publish retain independent SDK/UI Changesets releases.

Legacy release preparation/publication and native publication are disabled in
trunk mode. Historical recovery details follow; their branch/version choreography
applies only before cutover.

## PowerSync deployment configuration

The hosted-app release workflow reads these GitHub Actions repository variables:

- `POWERSYNC_PROJECT_ID`
- `POWERSYNC_ENVIRONMENT_ID`
- `POWERSYNC_API_SERVICE_ID`
- `POWERSYNC_COMPACT_SERVICE_ID`
- `POWERSYNC_REPLICATION_SERVICE_ID`

These identify the Railway deployment target. Keep credentials in the separate
`RAILWAY_RELEASE_TOKEN` secret in the production environment. Populate all five
variables and the token before releasing from a fork. Production check and deploy commands fail
before contacting Railway when any target variable is missing or blank.

For a local read-only production check, authenticate the Railway CLI, then load
the same repository variables into the command's environment:

```sh
python3 - <<'PY'
import json
import os
import subprocess

names = {
    "POWERSYNC_PROJECT_ID", "POWERSYNC_ENVIRONMENT_ID",
    "POWERSYNC_API_SERVICE_ID", "POWERSYNC_COMPACT_SERVICE_ID",
    "POWERSYNC_REPLICATION_SERVICE_ID",
}
output = subprocess.check_output([
    "gh", "variable", "list", "--repo", "LunarisApp/lunaris",
    "--json", "name,value",
])
variables = {item["name"]: item["value"] for item in json.loads(output)
             if item["name"] in names}
subprocess.run(["bun", "run", "powersync:config:check-production"],
               env={**os.environ, **variables}, check=True)
PY
```

Replace the repository name when operating a fork. Local rendering and
`bun run powersync:config:check` require none of these deployment variables.

## Maintainer security settings

[`CODEOWNERS`](../CODEOWNERS) requests maintainer review for all files. It does not enforce approval by itself. Configure GitHub repository rules
to require pull requests, passing CI checks, and code-owner approval for `main`;
dismiss stale approvals after new commits and restrict force pushes and deletion.
Choose reviewers and any administrator bypass deliberately: an author cannot
approve their own pull request, and this repository currently has one maintainer.

Before public launch, review these settings in GitHub:

- Enable private vulnerability reporting and link reporters to
  [`SECURITY.md`](../../SECURITY.md).
- Protect production and release environments with allowed deployment branches
  without a second routine reviewer gate. Bind the relevant
  workflow jobs to those environments and move their credentials into environment
  secrets together; creating an environment alone does not protect a job.
- Review external-contributor workflow approval settings. Keep production secrets
  out of pull-request jobs, and do not run contributor code in a privileged
  `pull_request_target` workflow.

On 2026-10-14, GitHub rejected branch-protection access for this private repository
with a requirement to upgrade the plan or make the repository public. The existing
`Backend (US) / production` and `Global / production` environments had no protection
rules or deployment branch policies. Deployment and release jobs did not reference
protected environments. Recheck these settings when changing repository visibility
or the account plan; the files in this directory do not enable those protections.

## CI cost controls

Feature PRs use their base SHA and `turbo ls --affected` to select edition builds,
Rust tests, desktop MCP smoke tests, and hosted-site builds. Shared package changes
include dependents. Brand, PowerSync, and release-tool checks also use explicit
input paths. Formatting, public-package validation, types, and workspace tests
remain mandatory. Repository documentation alone skips optional builds; content
under `apps/docs` still selects the hosted sites.

Pushes, manual runs, release PRs into `main`, and explicit release refs run full
validation. Unknown root/tooling inputs or failed detection also select everything.
The aggregate `CI` gate requires every selected job to succeed and rejects missing
selection outputs. PR edit triggers remain enabled, preserving base-change coverage.

CI suppresses Cypress binary downloads; the separate E2E workflow installs its
browser normally. Bun downloads and native Cargo builds persist across runs.
Edition and SDK build jobs persist Turbo cache with separate OS/job/edition keys.
Hosted sites remain uncached: docs postbuild writes `public/_pagefind`, outside
current Turbo outputs. Revisit those outputs before enabling hosted-site reuse.

## Shared setup and validation

All workflows use the local `setup-bun` composite action. It reads the exact Bun
version from root `package.json` (`packageManager`) and exports `BUN_VERSION` for
job-specific Turbo cache keys. Checkout and `bun install --frozen-lockfile` remain
explicit in each job. Download caching is opt-in and enabled only for the existing
CI jobs. E2E still installs Cypress and clears Bun's download cache afterward.
Manual npm recovery loads the setup action from the recovery tooling checkout,
so older release commits need not contain the action.

The aggregate `CI` job runs the dependency-free `tooling/ci/gate.ts` evaluator.
It checks selection outputs, mandatory and selected job results, PR release
policy, and required E2E results. Failed, cancelled, or malformed results fail the
gate. The gate installs no workspace dependencies.

General workflow contracts, action SHA pins (including local composite action
steps), setup, and gate tests run unconditionally in CI. Release-specific tests
remain under `tooling/release/automation`.

Run the same checks locally with the repository-pinned Bun:

```sh
bun test tooling/ci tooling/ci-selection.test.ts tooling/precommit.test.ts
bun run release:test
bun run tooling:typecheck
bun run check
```

`tooling:typecheck` covers all TypeScript under `tooling/`; `brand:typecheck` remains
an alias for existing callers.

## Publication status

Green branch CI is not proof of deployment. Inspect the parent Release - Publish
summary and recover failed publication before another release. Landing promotion
also checks homepage, self-hosting page, installer redirect, and installer asset.
See the [release runbook](../../docs/procedures/releasing-and-deploying.md#publication-status-and-landing-checks).

## Desktop installers

`Desktop - Build Windows and Linux` builds Windows x64 NSIS (`.exe`) and Linux
x64 Debian (`.deb`) installers on native runners. Linux uses Ubuntu 22.04 as its
compatibility baseline and requires WebKitGTK 4.1 at runtime. CI selects this
workflow for desktop changes and affected dependencies; its result is required
by the aggregate CI gate. CI artifacts remain downloadable for 14 days.

Every build includes the compiled Bun agent sidecar, frontend, and third-party
license notices. Rust tests and MCP smoke checks run against the built executable.
Build jobs have read-only repository permissions; release asset persistence runs
in separate jobs enabled only by the stable release caller.

`Native - Build stable artifacts` also calls this workflow with the reserved
product version. Windows and Linux installers have separate immutable receipts,
join the same draft GitHub product release, and must succeed before hosted
promotion. All desktop installers publish exclusively as GitHub release assets;
final release checksums cover every platform. CLI S3 publication stays enabled.
Homebrew remains macOS-only, with desktop downloads resolved from GitHub Releases.

Windows/Linux installers are currently unsigned. macOS retains universal DMG,
Developer ID/notarization when all six `APPLE_*` repository secrets are present,
and ad-hoc signing when none are present. Partial Apple credentials fail the
release. See [Tauri distribution](https://v2.tauri.app/distribute/) for platform
requirements. To release, run **Release Stable** on `main` with a successful
**Core - Candidate** run ID; use the existing stable recovery flow for retries.
