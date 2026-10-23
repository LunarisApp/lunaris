# Independent delivery

Lunaris uses one releasable trunk (`main`) after the cutover below. Production
apps ship independently. Public packages, self-hosted bundles and native apps
retain semantic releases. Before cutover, existing `next`/`main` automation stays
active; the old runbook remains the recovery reference.

## Workflow map

| Workflow | Runs | Result |
| --- | --- | --- |
| CI | PRs and trunk pushes | Affected workspace checks; one required `CI` result |
| Sites - Deploy | Trunk pushes, manual recovery | Independent landing/docs builds and production deployments |
| Core - Candidate | Trunk pushes affecting core or configuration | Private EE images, three isolated Cypress shards, staged candidate |
| Core - Promote | Manual candidate selection | API, web, or combined production promotion; explicit rollback |
| Artifacts - Prepare | Trunk pushes, manual | npm version PR and separate draft self-hosted version PR |
| Artifacts - Publish | Trunk pushes, manual recovery | Independent npm and self-hosted publication |
| Native - Publish | Manual target and exact SHA | Existing CLI/Desktop signing and distribution |

`DELIVERY_MODE` controls the transition. Empty/`legacy` keeps old release
orchestration active. `cutover` disables both old publication and new delivery.
`trunk` enables the new workflows and disables old release preparation/publication.
Never run two deployment owners for the same Railway service.

### Development

Branch from trunk and merge small PRs after `CI` and CodeQL. Shared workspace
changes include dependent consumers. Unknown root/tooling inputs select full
validation. Landing/docs have separate checks. Core PRs run edition builds and
short browser smoke coverage. Packaging/infrastructure PRs and self-hosted
release candidates run the complete installer matrix on AMD64 and ARM64.

Hosted changes need no app Changeset. Public-package changes need a Changeset;
self-hosted packaging changes need a `self-hosted` Changeset. To ship accumulated
core changes as a self-hosted release, add a `self-hosted` Changeset explicitly.
Native version changes remain part of the native release procedure.

Until trunk cutover, CI logs the proposed selection while retaining broad legacy
JS, package and installer validation. Compare those summaries before activation.

The required `CI` workflow always runs. Conditional jobs are evaluated by its
aggregate gate. Do not add workflow path filters to the required workflow.

### Hosted apps

Sites compare against each app's last **successful** GitHub deployment, not the
last push. Failed, skipped and superseded changes remain in the next selection.
Each site's validation, concurrency lock, Railway destinations and recovery
records are independent. Source uploads set `LUNARIS_BUILD_SHA` without an extra
deployment. Landing smoke includes installer routing.

Core builds use private `ghcr.io/<owner>/<repo>-hosted-api` and `-hosted-web`
packages. They are Enterprise Edition, distinct from public CE self-hosted images.
Both images have hosted entrypoints; API migration runs as a Railway pre-deploy
hook with a database advisory lock for regions sharing a database. Only changed
images rebuild, each from its own application build; every candidate specifies
both image digests.

Each Cypress shard runs isolated local services and the actual candidate images.
Shard zero also verifies returning-user offline behavior. Successful candidates
update one isolated staging stack and verify health/build SHA before publishing
the `core-candidate` artifact. The staging lock covers deployment and verification.

To promote, dispatch **Core - Promote** on `main`, supply the successful candidate
run ID, and select `api`, `web`, or `core`. Initial deployment requires `core`.
Partial promotion requires the untouched production counterparts to match those
actually tested. Otherwise promote the combined candidate. Older candidates
remain usable after newer trunk commits, but normal promotion cannot move behind
an already deployed production revision or an incomplete rollout attempt.

Production changes only environment-scoped image references. API regions finish
migrations and health checks before PowerSync configuration changes; dependent
web deployment follows. Registry image auto-updates and GitHub autodeploy must
stay disabled for core. Every successful composition is recorded as a
`production/core` GitHub deployment.

For rollback, leave candidate run blank and supply a prior successful
`production/core` deployment ID. Sync/configuration revisions must still match
both the last confirmed composition and every incomplete attempt since it.
Unresolved sync changes require forward recovery; web-only promotion is blocked
until API/sync are reconciled. Rollback never reverses database migrations. Use a
forward fix for incompatible schema, sync or configuration changes.

### Runtime configuration

The hosted PWA loads `/runtime-config.json` before app and telemetry initialization.
The response contains an explicit public allowlist: region discovery, analytics
and cookie-banner settings. Never include credentials. Configure
`VITE_REGION_DIRECTORY_URL` for each environment. `/regions.json` can serve an
explicit `VITE_REGION_DIRECTORY_JSON` directory when configured.

Configuration is network-only, excluded from service-worker navigation/precache.
Returning offline users use the last validated configuration stored on that
origin. Cold offline startup without previously validated settings fails visibly.
Desktop retains build-time settings. The health response includes
`X-Lunaris-Commit`, embedded into hosted images at build time.

## Configure before activation

1. Create GitHub `staging`, `production` and `release` environments restricted to
   `main`. Keep routine production promotion as the explicit manual dispatch;
   configure any additional organizational approvals deliberately.
2. Provision **one isolated Railway staging stack** with its own database, storage,
   Redis, PowerSync, API and web. Use staging auth URLs and region discovery. Never
   point staging at production state. Set Railway private GHCR read credentials
   for hosted API/web in both environments; private images require Railway Pro.
3. Keep `RAILWAY_RELEASE_TARGETS` in GitHub `production`. Its existing shape stays:

   ```json
   {"api":[{"project":"UUID","environment":"UUID","service":"UUID","healthUrl":"https://api.example.com/v1/health"}],"web":[{"project":"UUID","environment":"UUID","service":"UUID","healthUrl":"https://app.example.com/health"}],"landing":[{"project":"UUID","environment":"UUID","service":"UUID","healthUrl":"https://example.com/health"}],"docs":[{"project":"UUID","environment":"UUID","service":"UUID","healthUrl":"https://docs.example.com/health"}]}
   ```

4. Set `RAILWAY_STAGING_TARGETS` in GitHub `staging`, same shape with only staging
   API/web destinations. Set `RAILWAY_RELEASE_TOKEN` separately in staging and
   production. Configure these **staging-specific** variables in `staging`:
   `STAGING_POWERSYNC_PROJECT_ID`, `STAGING_POWERSYNC_ENVIRONMENT_ID`,
   `STAGING_POWERSYNC_API_SERVICE_ID`, `STAGING_POWERSYNC_COMPACT_SERVICE_ID`,
   `STAGING_POWERSYNC_REPLICATION_SERVICE_ID`. Existing `POWERSYNC_*` production
   variables remain. Preflight rejects sync targets outside the selected API
   environment before deploying anything.
5. Set repository variable `CORE_CONFIGURATION_REVISION` to a reviewed revision,
   e.g. `1`. Increment it for changes to core runtime configuration, service
   destinations or credentials requiring recertification. The same revision must
   be visible to candidate creation and promotion. Do not override it differently
   between GitHub environments.
6. Add npm trusted publishers for caller **`artifacts.publish.yml`**, environment
   `release`, to both public packages. Retain old caller trust until in-flight
   legacy releases finish. Continue OIDC/provenance and integrity verification.
   Keep the release App's existing repository-scoped credentials.
7. For hosted image services, clear old source build/config-file settings when
   switching to images, preserving networking, variables and health probes. The
   promotion workflow sets hosted start/pre-deploy commands per environment.
   Preserve current landing/docs Railpack configuration.

## Cut over

Do not switch the default branch while releases are running.

1. Merge this implementation into `next`. Complete or recover every current
   release and draft publication. Configure the prerequisites above.
2. Set repository `DELIVERY_MODE=cutover`. This stops automatic legacy release
   preparation/publication while the source branches are reconciled.
3. Merge `next` into `main` using the existing release PR procedure, preserving
   versions and all pending Changesets. No publication runs in cutover mode.
4. From a clean checkout of current `main`, preview then apply:

   ```sh
   RELEASE_MAINTAINER_TEAM_ID=<verified-team-id> bun tooling/delivery/cutover.ts
   RELEASE_MAINTAINER_TEAM_ID=<verified-team-id> bun tooling/delivery/cutover.ts --apply
   ```

   The script requires repository `DELIVERY_MODE=cutover` and refuses unreconciled
   history, active legacy runs, draft releases or missing destination/configuration
   variables. All list checks include every page. It installs trunk rulesets,
   changes the default branch, retargets open `next` PRs, freezes `next` without
   deleting history, and enables `DELIVERY_MODE=trunk` last. It never merges a PR
   or rewrites local branches. Interrupted execution requires inspecting remote
   state before retrying.
5. Dispatch **Artifacts - Prepare** and **Sites - Deploy** on `main`. The first
   core-affecting trunk push builds and certifies staging; use its run ID for the
   initial combined production promotion. Retain original recovery records/tags.

Historical `.release/manifest.json`, release tags, hosted versions and mixed
Changesets remain readable. New version PRs consume only their selected release
family and preserve other pending entries. Legacy workflows stay disabled in
trunk mode so historical publication recovery can be inspected deliberately.

## Recover and measure

A green `CI` result is not deployment success. Inspect each workflow's summary,
GitHub deployment statuses and Railway deployment ID.

- Sites: rerun **Sites - Deploy**; successful destinations resume without another
  upload. Unknown upload outcomes intentionally block replay.
- Core: retry the selected candidate after fixing a failed destination. Successful
  image references remain identical. Unknown environment-edit outcomes require
  reconciliation before another update.
- To reconcile a service attempt after inspecting Railway, run:

  ```sh
  bun tooling/delivery/reconcile.ts <github-service-deployment-id> <railway-deployment-id>
  ```

  Load the correct token/destination environment first. The command verifies
  provider status and core build SHA before recording success. Aggregate core/site
  records are not service records. A known failed provider attempt is recorded as
  failed and can then be retried.
- npm/self-hosted: rerun **Artifacts - Publish**. Completed releases are skipped;
  pending versions drain oldest first, one per family per run; repeat dispatch
  when several version PRs accumulated. Missing/draft releases retain their
  original version commit. npm refuses
  different bytes; self-hosted publication retains checksums and digest pins.

Compare queue time and execution time separately using GitHub Actions run/job
history. Track ordinary-PR feedback, site time-to-production, candidate readiness,
production promotion and recovery time. Inspect Turbo/BuildKit cache hits in job
logs. Warm-run goals: ordinary PR feedback under five minutes; sites under five
minutes; core promotion under five minutes excluding migrations/provider queues.

Validation commands:

```sh
bun run check
bun run tooling:typecheck
bun run typecheck --filter=api --filter=web --filter=@repo/app-shell
bun test tooling/ci tooling/ci-selection.test.ts tooling/release tooling/delivery
bun run test --filter=web --filter=@repo/app-shell
```

Use Actionlint for workflow semantics and build both `hosted-api`/`hosted-web`
Docker targets before activation. Production/staging verification requires the
configured remote environments and cannot be established by local unit tests.
