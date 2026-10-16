# GitHub workflows

- `ci.yml` validates pull requests and pushes to `main`/`next`, and supports manual
  dispatch: code quality, types, unit tests, generated configs, Rust agents,
  and Desktop MCP smoke tests.
- `e2e.yml` runs the full browser suite for ready PRs into `main`, final release
  commit validation, and manual runs. Feature PRs, draft release PRs, and ordinary
  branch pushes skip E2E. Nightly runs are disabled to avoid duplicate costs.
- `release.yml` manually builds/publishes CLI and Desktop; it owns no version PR.
- `release.prepare.yml` creates a draft `next` to `main` release PR and preserves
  its review state when updating release notes.
- `release.publish.yml` versions, validates, tags, publishes, and back-merges.
- `packages.publish.yml` publishes public npm packages through the coordinator.
- `apps.publish.yml` deploys stable releases to Railway through the coordinator.
- `images.publish.yml` validates, builds, smoke-tests, and publishes Community
  AIO/API/web images for AMD64 and ARM64 on `aio-v*`, `api@*`, and `web@*` tags.
  Manual dispatch accepts an existing tag for recovery. See
  [AIO publishing](../../infra/all-in-one/README.md#publishing-to-docker-hub) and
  [separate images](../../infra/images/README.md).

See [release setup and operation](../../docs/procedures/releasing-and-deploying.md).
Release automation and PR release-policy checks are enabled by default.
PowerSync deployment runs through the hosted-app release pipeline; the standalone
PowerSync push workflow has been retired.

CI requires E2E success for ready PRs into `main` (including hotfixes), manual CI
runs, and validation of the exact version commit. Other CI runs allow E2E to be
skipped. New commits to a ready release PR rerun E2E and cancel superseded PR
runs; keep the PR draft while accumulating changes. Publishing starts only after
aggregate CI passes on the exact version commit.

For optional feature-branch testing, dispatch `E2E` manually and select that branch.

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
