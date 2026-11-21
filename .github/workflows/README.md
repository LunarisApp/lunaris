# GitHub workflows

See [trunk delivery and stable releases](../../docs/procedures/independent-delivery.md)
for current architecture, migration, credentials and recovery.

- CI gates feature PRs with affected checks and CodeQL.
- Core - Candidate certifies private images through three Cypress shards after main merges.
- Release Stable selects a candidate, builds all installable outputs, promotes
  hosted digests, and publishes one product release.
- Native - Build stable artifacts is reusable by the stable coordinator.
- Core - Promote manual dispatch provides explicit rollback only.
- Sites - Deploy independently deploys landing/docs after successful checks.
- Artifacts - Prepare/Publish retain independent SDK/UI Changesets releases.

Retired release preparation/publication and standalone native workflows have been
removed. Active jobs keep their existing validation and publication order. Shared
release helpers remain under `tooling/release`; orchestration lives in
`tooling/delivery`. Historical manifests and npm recovery remain supported.

## PowerSync deployment configuration

Core promotion reads these GitHub Actions repository variables:

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

PRs and pushes select checks from the Git diff and workspace manifests. Changes to
a shared package include its dependents. On PRs limited to the presentation paths
listed in [the selector](../../tooling/ci-selection.ts), edition builds cover the
desktop frontend and CI skips native desktop packaging and the macOS MCP smoke test.
Repository docs and Changesets notes can accompany those edits. A mixed desktop diff
or a push affecting desktop dependencies selects both native checks.

Brand, PowerSync, public-package, and release-tool checks use affected packages
or explicit input paths. Formatting, type checks, and workspace test jobs run on
every PR. Repository documentation alone skips optional builds. Changes under
`apps/docs` select the docs build.

Manual runs, explicit release refs, unknown root/tooling inputs, and failed change
detection select full validation.
The aggregate `CI` gate requires every selected job to succeed and rejects missing
selection outputs. PR edit triggers remain enabled, preserving base-change coverage.

CI suppresses Cypress binary downloads; the separate E2E workflow installs its
browser normally. Bun downloads and native Cargo builds persist across runs.
Edition builds and Agent Rust share the repository's Turbo cache action. Its
keys include the runner OS, architecture, edition, Bun version and lockfile
hash.

## Shared setup and validation

All workflows use the local `setup-bun` composite action. It reads the exact Bun
version from root `package.json` (`packageManager`) and exports `BUN_VERSION` for
job-specific Turbo cache keys. The selector and aggregate gate run directly after
checkout and Bun setup. Jobs that need workspace dependencies install them with
`bun install --frozen-lockfile`. The Bun download cache is opt-in. E2E still
installs Cypress and clears Bun's download cache afterward.
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

Green branch CI is not proof of deployment. Inspect Release Stable, Artifacts -
Publish, or Sites - Deploy for the affected output. Recover failed publication
before another release. Landing deployment checks both install pages and the
installer endpoints.
See the [release runbook](../../docs/procedures/releasing-and-deploying.md#publication-status-and-landing-checks).

## Desktop installers

`Desktop - Build Windows and Linux` builds Windows x64 NSIS (`.exe`) and Linux
x64 Debian (`.deb`) installers on native runners. Linux uses Ubuntu 22.04 as its
compatibility baseline and requires WebKitGTK 4.1 at runtime. CI selects this
workflow for desktop changes and affected dependencies, subject to the
[presentation-only PR rule](#ci-cost-controls). The aggregate CI gate requires
selected builds to pass. CI artifacts remain downloadable for 14 days.

Every build includes the compiled Bun agent sidecar, frontend, and third-party
license notices. Rust tests and MCP smoke checks run against the built executable.
Source validation runs on the workflow revision before requested code executes.
PR builds must use the current PR commit and cannot publish; other events require
an exact commit already in `main` history. Only the validated revision reaches
build checkouts, which do not persist Git credentials.
Build jobs have read-only repository permissions; release asset persistence runs
in separate jobs enabled only by the stable release caller.

`Native - Build stable artifacts` also calls this workflow with the reserved
product version. Windows and Linux installers have separate immutable receipts,
join the same draft GitHub product release, and must succeed before hosted
promotion. All desktop installers publish exclusively as GitHub release assets;
final release checksums cover every platform.

Windows/Linux installers are currently unsigned. macOS retains universal DMG,
Developer ID/notarization when all six `APPLE_*` repository secrets are present,
and ad-hoc signing when none are present. Partial Apple credentials fail the
release. See [Tauri distribution](https://v2.tauri.app/distribute/) for platform
requirements. To release, run **Release Stable** on `main` with a successful
**Core - Candidate** run ID; use the existing stable recovery flow for retries.

## CLI archives

`Native - Build stable artifacts` tests and packages the CLI on native runners.
The stable release includes a universal macOS ZIP, a Windows x64 ZIP, and Linux
tarballs for x64 and ARM64 (glibc 2.39+). Each platform has an immutable receipt.
The install scripts read the stable release's `SHA256SUMS` and verify the archive
before installing. Homebrew uses the macOS ZIP.
Candidates with `tooling/delivery/cli-artifacts.sh` include the Windows and Linux
archives. Resuming a release from an older candidate keeps its original assets.
