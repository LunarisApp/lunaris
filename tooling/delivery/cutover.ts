import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { git, run } from "../release/automation/process";
import {
  assertSettings,
  assertWritableRules,
  desiredRules,
  trunkSettings,
  type RuleSnapshot,
} from "./repository-settings";

const apply = process.argv.includes("--apply");
const repository =
  process.env.GITHUB_REPOSITORY ??
  run("gh", [
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]).text;
const root = `repos/${repository}`;
function get<T>(path: string): T {
  return JSON.parse(
    run("gh", ["api", `${root}${path ? `/${path}` : ""}`]).text
  );
}
function pages<T>(path: string): T[] {
  return JSON.parse(
    run("gh", ["api", `${root}/${path}`, "--paginate", "--slurp"]).text
  );
}
async function request(path: string, method: string, body?: unknown) {
  const child = Bun.spawn(
    [
      "gh",
      "api",
      `${root}${path ? `/${path}` : ""}`,
      "--method",
      method,
      ...(body === undefined ? [] : ["--input", "-"]),
    ],
    {
      stdin: body === undefined ? "ignore" : new Blob([JSON.stringify(body)]),
      stdout: "ignore",
      stderr: "inherit",
    }
  );
  if (await child.exited) {
    throw new Error(
      `Cutover stopped at ${path}; publication remains disabled. Reread state before retry.`
    );
  }
}
interface Variable {
  name: string;
  value: string;
}
interface Environment {
  can_admins_bypass?: boolean;
  deployment_branch_policy: unknown;
  name: string;
  protection_rules: {
    type: string;
    wait_timer?: number;
    prevent_self_review?: boolean;
    reviewers?: { type: string; reviewer: { id: number } }[];
  }[];
}
const legacyWorkflows = [
  "release.prepare.yml",
  "release.publish.yml",
  "release.yml",
];
const deliveryWorkflows = [
  "core.candidate.yml",
  "core.promote.yml",
  "release.stable.yml",
  "artifacts.prepare.yml",
  "artifacts.publish.yml",
  "sites.deploy.yml",
];
interface Workflow {
  id: number;
  path: string;
  state: string;
}
function readWorkflows() {
  return pages<{ workflows: Workflow[] }>(
    "actions/workflows?per_page=100"
  ).flatMap((page) => page.workflows);
}
const workflows = readWorkflows();
async function setWorkflow(workflow: Workflow, enabled: boolean) {
  await request(
    `actions/workflows/${workflow.id}/${enabled ? "enable" : "disable"}`,
    "PUT"
  );
  const actual = get<Workflow>(`actions/workflows/${workflow.id}`);
  if (actual.state !== (enabled ? "active" : "disabled_manually")) {
    throw new Error(`Workflow state readback failed: ${workflow.path}`);
  }
}
const variables = pages<{ variables: Variable[] }>(
  "actions/variables?per_page=100"
).flatMap((page) => page.variables);
const value = (name: string) =>
  variables.find((entry) => entry.name === name)?.value;
const metadata = get<Record<string, unknown>>("");
const rules = pages<RuleSnapshot[]>(
  "rulesets?includes_parents=true&per_page=100"
).flat();
const fullRules = rules.map((rule) =>
  rule.source && rule.source !== repository
    ? rule
    : get<RuleSnapshot>(`rulesets/${rule.id}`)
);
const environments = pages<{ environments: Environment[] }>(
  "environments?per_page=100"
).flatMap((page) => page.environments);
const environmentDetails = environments
  .map((entry) =>
    get<Environment>(`environments/${encodeURIComponent(entry.name)}`)
  )
  .map((environment) => ({
    ...environment,
    variableNames: pages<{ variables: Variable[] }>(
      `environments/${encodeURIComponent(environment.name)}/variables?per_page=100`
    ).flatMap((page) => page.variables.map((entry) => entry.name)),
    secretNames: pages<{ secrets: { name: string }[] }>(
      `environments/${encodeURIComponent(environment.name)}/secrets?per_page=100`
    ).flatMap((page) => page.secrets.map((entry) => entry.name)),
    policies: environment.deployment_branch_policy
      ? pages<{
          branch_policies: { id: number; name: string; type: string }[];
        }>(
          `environments/${encodeURIComponent(environment.name)}/deployment-branch-policies?per_page=100`
        ).flatMap((page) => page.branch_policies)
      : [],
  }));
const prs = pages<
  {
    number: number;
    title: string;
    head: { ref: string; sha?: string };
    base: { ref: string };
  }[]
>("pulls?state=open&per_page=100").flat();
const actions = get<Record<string, unknown>>("actions/permissions");
const workflowPermissions = get<Record<string, unknown>>(
  "actions/permissions/workflow"
);
const secretNames = pages<{ secrets: { name: string }[] }>(
  "actions/secrets?per_page=100"
).flatMap((page) => page.secrets.map((entry) => entry.name));
const directory = resolve(
  process.env.CUTOVER_STATE_DIRECTORY ?? ".context/release-cutover"
);
mkdirSync(directory, { recursive: true });
const snapshotPath = resolve(directory, "before.json");
if (!existsSync(snapshotPath)) {
  writeFileSync(
    snapshotPath,
    `${JSON.stringify({ repository, metadata, rules: fullRules, environments: environmentDetails, actions, workflowPermissions, variableNames: variables.map((entry) => entry.name), secretNames, prs, workflows }, null, 2)}\n`,
    { mode: 0o600 }
  );
} else if (
  JSON.parse(readFileSync(snapshotPath, "utf8")).repository !== repository
) {
  throw new Error("Cutover snapshot belongs to another repository");
}
const blockers: string[] = [];
for (const name of ["RELEASE_APP_ID", "CORE_CONFIGURATION_REVISION"]) {
  if (!value(name)) {
    blockers.push(`Missing repository variable ${name}`);
  }
}
for (const name of ["production", "staging", "release"]) {
  if (!environments.some((entry) => entry.name === name)) {
    blockers.push(`Missing GitHub environment ${name}`);
  }
}
for (const name of ["production", "staging"]) {
  const details = environmentDetails.find((entry) => entry.name === name);
  if (!details) {
    continue;
  }
  const required =
    name === "staging"
      ? [
          "RAILWAY_STAGING_TARGETS",
          ...[
            "PROJECT_ID",
            "ENVIRONMENT_ID",
            "API_SERVICE_ID",
            "COMPACT_SERVICE_ID",
            "REPLICATION_SERVICE_ID",
          ].map((key) => `STAGING_POWERSYNC_${key}`),
        ]
      : ["RAILWAY_RELEASE_TARGETS"];
  for (const key of required) {
    if (!(details.variableNames.includes(key) || value(key))) {
      blockers.push(`Missing ${name} variable ${key}`);
    }
  }
  if (
    !(
      details.secretNames.includes("RAILWAY_RELEASE_TOKEN") ||
      secretNames.includes("RAILWAY_RELEASE_TOKEN")
    )
  ) {
    blockers.push(`Missing ${name} RAILWAY_RELEASE_TOKEN`);
  }
}
for (const name of [
  "RELEASE_APP_PRIVATE_KEY",
  "RELEASES_S3_ACCESS_KEY_ID",
  "RELEASES_S3_SECRET_ACCESS_KEY",
  "RELEASES_S3_REGION",
  "RELEASES_S3_BUCKET",
  "HOMEBREW_TAP_TOKEN",
]) {
  if (
    !(
      secretNames.includes(name) ||
      environmentDetails
        .find((entry) => entry.name === "release")
        ?.secretNames.includes(name)
    )
  ) {
    blockers.push(`Missing release secret ${name}`);
  }
}
const teamId = Number(process.env.RELEASE_MAINTAINER_TEAM_ID);
if (!Number.isSafeInteger(teamId) || teamId <= 0) {
  blockers.push("Verified RELEASE_MAINTAINER_TEAM_ID required");
}
try {
  assertWritableRules(rules, repository);
} catch (error) {
  blockers.push(String(error));
}
for (const status of [
  "in_progress",
  "queued",
  "requested",
  "waiting",
  "pending",
]) {
  const runs = pages<{
    total_count: number;
    workflow_runs: { path: string }[];
  }>(`actions/runs?status=${status}&per_page=100`);
  if (
    runs.some(
      (page) =>
        page.total_count > 1000 ||
        page.workflow_runs.some((entry) =>
          /(?:release(?:\.(?:prepare|publish|stable))?|core\.(?:promote|candidate)|artifacts\.publish|sites\.deploy)\.yml$/.test(
            entry.path
          )
        )
    )
  ) {
    blockers.push(`Active release runs (${status})`);
  }
}
if (
  pages<{ draft: boolean }[]>("releases?per_page=100")
    .flat()
    .some((entry) => entry.draft)
) {
  blockers.push("Finish draft publications before cutover");
}
console.log(
  JSON.stringify(
    {
      repository,
      settings: trunkSettings,
      rulesets:
        Number.isSafeInteger(teamId) && Number(value("RELEASE_APP_ID")) > 0
          ? desiredRules(Number(value("RELEASE_APP_ID")), teamId)
          : [],
      snapshot: snapshotPath,
      blockers,
    },
    null,
    2
  )
);
if (!apply) {
  process.exit(0);
}
// Pause entrypoints using GitHub's workflow controls, independent of checked-in code.
const workflowSnapshot = resolve(directory, "workflows-before.json");
if (!existsSync(workflowSnapshot)) {
  writeFileSync(workflowSnapshot, `${JSON.stringify(workflows, null, 2)}\n`, {
    mode: 0o600,
  });
}
for (const workflow of workflows) {
  if (
    [...legacyWorkflows, ...deliveryWorkflows].some(
      (name) => workflow.path === `.github/workflows/${name}`
    )
  ) {
    await setWorkflow(workflow, false);
  }
}
// Existing runs can evaluate later jobs after disable; drain before removing old guards.
if (blockers.some((blocker) => blocker.startsWith("Active release runs"))) {
  throw new Error(
    "Drain active release runs before removing historical publication guards"
  );
}
// Removing the historical switch is safe only after legacy entrypoints are disabled.
if (value("DELIVERY_MODE") !== undefined) {
  await request("actions/variables/DELIVERY_MODE", "DELETE");
  const remaining = pages<{ variables: Variable[] }>(
    "actions/variables?per_page=100"
  ).flatMap((page) => page.variables);
  if (remaining.some((entry) => entry.name === "DELIVERY_MODE")) {
    throw new Error("Obsolete delivery variable still exists");
  }
}
if (blockers.length) {
  throw new Error(
    `Cutover blocked; publication disabled: ${blockers.join("; ")}`
  );
}
git("fetch", "origin", "main", "next");
git("merge-base", "--is-ancestor", "origin/next", "origin/main");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
  throw new Error(
    "Merge implementation and reconcile next; run cutover from current main"
  );
}
if (
  !git("show", "origin/main:.github/workflows/release.stable.yml").includes(
    "name: Release Stable"
  )
) {
  throw new Error("Stable implementation missing from main");
}
for (const rule of desiredRules(Number(value("RELEASE_APP_ID")), teamId)) {
  const existing = rules.find((entry) => entry.name === rule.name);
  const path = existing ? `rulesets/${existing.id}` : "rulesets";
  await request(path, existing ? "PUT" : "POST", rule);
  const all = pages<RuleSnapshot[]>(
    "rulesets?includes_parents=true&per_page=100"
  ).flat();
  const saved = all.find((entry) => entry.name === rule.name);
  const actual = saved
    ? get<Record<string, unknown>>(`rulesets/${saved.id}`)
    : undefined;
  for (const [key, expected] of Object.entries(rule)) {
    if (JSON.stringify(actual?.[key]) !== JSON.stringify(expected)) {
      throw new Error(`Ruleset readback mismatch: ${rule.name}.${key}`);
    }
  }
}
await request("", "PATCH", trunkSettings);
assertSettings(get(""));
for (const pr of prs.filter((entry) => entry.base.ref === "next")) {
  await request(`pulls/${pr.number}`, "PATCH", { base: "main" });
}
// Close legacy orchestration PRs only when their source history is already preserved.
for (const pr of prs.filter(
  (entry) =>
    entry.head.ref === "next" ||
    entry.head.ref.startsWith("back-merge/") ||
    entry.head.ref === "release/self-hosted"
)) {
  const source = pr.head.ref === "next" ? "origin/next" : pr.head.sha;
  if (
    source &&
    run("git", ["merge-base", "--is-ancestor", source, "origin/main"], {
      allowFailure: true,
    }).ok
  ) {
    await request(`pulls/${pr.number}`, "PATCH", { state: "closed" });
  }
}
for (const environment of environmentDetails.filter((entry) =>
  ["production", "staging", "release"].includes(entry.name)
)) {
  const path = `environments/${environment.name}`;
  // GitHub PUT can reset omitted protection fields; carry existing values explicitly.
  const review = environment.protection_rules.find(
    (rule) => rule.type === "required_reviewers"
  );
  const timer = environment.protection_rules.find(
    (rule) => rule.type === "wait_timer"
  );
  await request(path, "PUT", {
    ...(review
      ? {
          reviewers: review.reviewers?.map((item) => ({
            type: item.type,
            id: item.reviewer.id,
          })),
          prevent_self_review: review.prevent_self_review,
        }
      : {}),
    ...(timer ? { wait_timer: timer.wait_timer } : {}),
    ...(environment.can_admins_bypass === undefined
      ? {}
      : { can_admins_bypass: environment.can_admins_bypass }),
    deployment_branch_policy: {
      protected_branches: false,
      custom_branch_policies: true,
    },
  });
  if (
    !environment.policies.some(
      (policy) => policy.name === "main" && policy.type === "branch"
    )
  ) {
    await request(`${path}/deployment-branch-policies`, "POST", {
      name: "main",
      type: "branch",
    });
  }
  for (const policy of environment.policies.filter(
    (entry) => entry.name !== "main" || entry.type !== "branch"
  )) {
    await request(`${path}/deployment-branch-policies/${policy.id}`, "DELETE");
  }
  const saved = pages<{ branch_policies: { name: string; type: string }[] }>(
    `${path}/deployment-branch-policies?per_page=100`
  ).flatMap((entry) => entry.branch_policies);
  if (
    saved.length !== 1 ||
    saved[0]?.name !== "main" ||
    saved[0].type !== "branch"
  ) {
    throw new Error(`Environment readback failed: ${environment.name}`);
  }
}
const oldNext = rules.find((rule) => rule.name === "Release next - PRs");
if (oldNext) {
  await request(`rulesets/${oldNext.id}`, "DELETE");
}
await request("actions/permissions/workflow", "PUT", {
  default_workflow_permissions: "read",
  can_approve_pull_request_reviews:
    workflowPermissions.can_approve_pull_request_reviews,
});
if (
  get<{ default_workflow_permissions: string }>("actions/permissions/workflow")
    .default_workflow_permissions !== "read"
) {
  throw new Error("Actions readback failed");
}
assertWritableRules(
  pages<RuleSnapshot[]>("rulesets?includes_parents=true&per_page=100").flat(),
  repository
);
assertSettings(get(""));
writeFileSync(
  resolve(directory, "verified.json"),
  `${JSON.stringify({ repository, settings: get(""), rules: pages("rulesets?includes_parents=true&per_page=100"), at: new Date().toISOString() }, null, 2)}\n`,
  { mode: 0o600 }
);
// Publication stays paused until isolated staging/native rehearsal and npm trust are attested.
if (process.env.RELEASE_REHEARSAL_VERIFIED !== "true") {
  throw new Error(
    "Settings migrated; publication paused. Verify isolated release rehearsal and npm trust, then rerun with RELEASE_REHEARSAL_VERIFIED=true"
  );
}
const available = readWorkflows();
for (const name of deliveryWorkflows) {
  if (
    !available.some((workflow) => workflow.path === `.github/workflows/${name}`)
  ) {
    throw new Error(
      `Delivery workflow missing: ${name}; publication remains paused`
    );
  }
}
try {
  for (const name of deliveryWorkflows) {
    await setWorkflow(
      available.find(
        (workflow) => workflow.path === `.github/workflows/${name}`
      )!,
      true
    );
  }
} catch (error) {
  const failures = [];
  for (const workflow of available.filter((entry) =>
    deliveryWorkflows.some((name) => entry.path === `.github/workflows/${name}`)
  )) {
    try {
      await setWorkflow(workflow, false);
    } catch {
      failures.push(workflow.path);
    }
  }
  if (failures.length) {
    throw new Error(
      `Activation failed; manually disable workflows: ${failures.join(", ")}`,
      { cause: error }
    );
  }
  throw error;
}
console.log("GitHub cutover verified; delivery workflows enabled.");
