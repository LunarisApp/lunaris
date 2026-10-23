import { writeFileSync } from "node:fs";
import { versionFamily } from "./version-family";
import { git, run } from "../release/automation/process";

const releases = versionFamily("self-hosted");
if (!releases.length) {
  process.exit(0);
}
run("bun", ["install", "--lockfile-only", "--ignore-scripts"]);
run("bun", [
  "x",
  "--no-install",
  "biome",
  "format",
  "--write",
  ".changeset",
  ".release/self-hosted.json",
  "infra/self-host/package.json",
]);
const branch = "release/self-hosted";
const previous =
  run("git", [
    "ls-remote",
    "--heads",
    "origin",
    `refs/heads/${branch}`,
  ]).text.split(/\s/)[0] ?? "";
git("config", "user.name", "lunaris-release[bot]");
git("config", "user.email", "lunaris-release[bot]@users.noreply.github.com");
git("checkout", "-b", branch);
git(
  "add",
  ".changeset",
  ".release/self-hosted.json",
  "infra/self-host/package.json",
  "infra/self-host/CHANGELOG.md",
  "bun.lock"
);
git("commit", "-m", "chore(release): version self-hosted");
git(
  "push",
  `--force-with-lease=refs/heads/${branch}:${previous}`,
  "origin",
  `HEAD:refs/heads/${branch}`
);
const existing = JSON.parse(
  run("gh", [
    "pr",
    "list",
    "--base",
    "main",
    "--head",
    branch,
    "--state",
    "open",
    "--json",
    "number",
  ]).text
) as { number: number }[];
const body = `${process.env.RUNNER_TEMP ?? "/tmp"}/self-host-release.md`;
writeFileSync(
  body,
  releases.map((entry) => `## ${entry.tag}\n\n${entry.notes}`).join("\n\n")
);
run("gh", [
  "pr",
  ...(existing[0]
    ? ["edit", String(existing[0].number)]
    : ["create", "--draft", "--base", "main", "--head", branch]),
  "--title",
  "chore(release): version self-hosted",
  "--body-file",
  body,
]);
