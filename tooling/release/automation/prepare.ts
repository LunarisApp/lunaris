import { writeFileSync } from "node:fs";
import { git, run } from "./process";
import { versionTargets } from "./version";

git("fetch", "origin", "main", "next");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/next")) {
  throw new Error("Stale next run");
}
if (
  run("git", ["diff", "--quiet", "origin/main", "HEAD"], { allowFailure: true })
    .ok
) {
  process.exit(0);
}
const releases = versionTargets();
const body = [
  "Mark this PR ready for review to run full E2E, then wait for CI on the latest revision. Merge with a **merge commit** when ready. This publishes npm packages and deploys affected hosted apps to Railway production, and publishes self-hosted deployment bundles automatically.",
  "No preview deployments or release candidates. Database/sync changes must remain compatible with existing clients.",
  ...releases.map((entry) => `## ${entry.tag}\n\n${entry.notes}`),
  ...(releases.length
    ? []
    : [
        "No package version bumps. Automation-only changes will be back-merged.",
      ]),
].join("\n\n");
const bodyFile = `${process.env.RUNNER_TEMP ?? "/tmp"}/lunaris-release-notes.md`;
writeFileSync(bodyFile, body.slice(0, 55_000));
const existing = JSON.parse(
  run("gh", [
    "pr",
    "list",
    "--base",
    "main",
    "--head",
    "next",
    "--state",
    "open",
    "--json",
    "number",
  ]).text
) as { number: number }[];
const title = releases.length
  ? `chore(release): ${releases.map((entry) => entry.tag).join(", ")}`.slice(
      0,
      250
    )
  : "chore(release): promote next";
run("gh", [
  "pr",
  ...(existing[0]
    ? ["edit", String(existing[0].number)]
    : ["create", "--draft", "--base", "main", "--head", "next"]),
  "--title",
  title,
  "--body-file",
  bodyFile,
]);
