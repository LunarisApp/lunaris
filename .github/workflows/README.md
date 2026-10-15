# GitHub workflows

- `ci.yml` validates every pull request and `main` push, and supports manual
  dispatch: code quality, types, unit tests, generated configs, Rust agents,
  and Desktop MCP smoke tests.
- `e2e.yml` runs the full browser suite daily when the repository changed, or
  on manual dispatch.
- `deploy-powersync.yml` deploys PowerSync config changes after they reach
  `main`.
- `release.yml` maintains the Changesets version PR, then builds and publishes
  approved CLI and Desktop releases.

CI stays separate from E2E, deployment, and release automation so each
workflow has one trigger policy and one operational goal.

## PowerSync deployment configuration

The PowerSync workflow reads these GitHub Actions repository variables:

- `POWERSYNC_PROJECT_ID`
- `POWERSYNC_ENVIRONMENT_ID`
- `POWERSYNC_API_SERVICE_ID`
- `POWERSYNC_COMPACT_SERVICE_ID`
- `POWERSYNC_REPLICATION_SERVICE_ID`

These identify the Railway deployment target. Keep credentials in the separate
`RAILWAY_TOKEN` repository secret. Populate all five variables before enabling
the deployment workflow in a fork. Production check and deploy commands fail
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
  and required reviewers where the account plan supports them. Bind the relevant
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
