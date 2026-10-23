import { trunkRulesets } from "../release/automation/rulesets";
import { git, run } from "../release/automation/process";

// Apply only after the cutover-mode merge has put the implementation on main.
const apply = process.argv.includes("--apply");
git("fetch", "origin", "main", "next");
git("merge-base", "--is-ancestor", "origin/next", "origin/main");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
  throw new Error("Run cutover from current main after reconciling next");
}
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
interface Variable {
  name: string;
  value: string;
}
function pages<T>(path: string): T[] {
  return JSON.parse(
    run("gh", ["api", `repos/${repository}/${path}`, "--paginate", "--slurp"])
      .text
  );
}
const vars = pages<{ variables: Variable[] }>(
  "actions/variables?per_page=100"
).flatMap((page) => page.variables);
if (vars.find((entry) => entry.name === "DELIVERY_MODE")?.value !== "cutover") {
  throw new Error("Set repository DELIVERY_MODE=cutover before cutover");
}
for (const status of [
  "in_progress",
  "queued",
  "requested",
  "waiting",
  "pending",
]) {
  const batches = pages<{
    total_count: number;
    workflow_runs: { path: string }[];
  }>(`actions/runs?status=${status}&per_page=100`);
  if (batches.some((page) => page.total_count > 1000)) {
    throw new Error("Too many active workflow runs to verify cutover safely");
  }
  if (
    batches.some((page) =>
      page.workflow_runs.some((entry) =>
        /release\.(prepare|publish)\.yml$/.test(entry.path)
      )
    )
  ) {
    throw new Error("Legacy release automation is still running");
  }
}
const releases = pages<{ draft: boolean }[]>("releases?per_page=100").flat();
if (releases.some((entry) => entry.draft)) {
  throw new Error("Finish draft publications before cutover");
}
for (const environment of ["production", "staging"]) {
  const variables = pages<{ variables: Variable[] }>(
    `environments/${environment}/variables?per_page=100`
  ).flatMap((page) => page.variables);
  const names = new Set(variables.map((entry) => entry.name));
  if (
    !names.has(
      environment === "staging"
        ? "RAILWAY_STAGING_TARGETS"
        : "RAILWAY_RELEASE_TARGETS"
    )
  ) {
    throw new Error(`Missing ${environment} Railway destinations`);
  }
}
// Snapshot every affected resource before the first mutation.
const existing = pages<{ id: number; name: string }[]>(
  "rulesets?per_page=100"
).flat();
const prs = pages<{ number: number }[]>(
  "pulls?base=next&state=open&per_page=100"
).flat();
const appId = Number(
  vars.find((entry) => entry.name === "RELEASE_APP_ID")?.value
);
if (
  !vars.some(
    (entry) => entry.name === "CORE_CONFIGURATION_REVISION" && entry.value
  )
) {
  throw new Error("Set CORE_CONFIGURATION_REVISION first");
}
const teamId = Number(process.env.RELEASE_MAINTAINER_TEAM_ID);
const rules = trunkRulesets(appId, teamId);
console.log(
  JSON.stringify(
    { defaultBranch: "main", deliveryMode: "trunk", rulesets: rules },
    null,
    2
  )
);
if (!apply) {
  process.exit(0);
}
async function request(path: string, method: string, value?: unknown) {
  const child = Bun.spawn(
    [
      "gh",
      "api",
      `repos/${repository}/${path}`,
      "--method",
      method,
      ...(value === undefined ? [] : ["--input", "-"]),
    ],
    {
      stdin: value === undefined ? "ignore" : new Blob([JSON.stringify(value)]),
      stdout: "ignore",
      stderr: "inherit",
    }
  );
  if (await child.exited) {
    throw new Error(
      `Cutover stopped at ${path}; inspect state before retrying`
    );
  }
}
for (const rule of rules) {
  const previous = existing.find((entry) => entry.name === rule.name);
  await request(
    previous ? `rulesets/${previous.id}` : "rulesets",
    previous ? "PUT" : "POST",
    rule
  );
}
await request("", "PATCH", { default_branch: "main" });
for (const pr of prs) {
  await request(`pulls/${pr.number}`, "PATCH", { base: "main" });
}
// Freeze next without deleting its history.
const freeze = {
  name: "Retired next - frozen",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["refs/heads/next"], exclude: [] } },
  bypass_actors: [],
  rules: [
    { type: "update" },
    { type: "deletion" },
    { type: "non_fast_forward" },
  ],
};
const previous = existing.find((rule) => rule.name === freeze.name);
await request(
  previous ? `rulesets/${previous.id}` : "rulesets",
  previous ? "PUT" : "POST",
  freeze
);
run("gh", [
  "variable",
  "set",
  "DELIVERY_MODE",
  "--repo",
  repository,
  "--body",
  "trunk",
]);
console.log(
  "Trunk enabled. Dispatch Artifacts - Prepare and Sites - Deploy; push a core change to certify staging."
);
