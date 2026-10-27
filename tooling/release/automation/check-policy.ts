import { readFileSync } from "node:fs";
import {
  affectedTargets,
  parseChangeset,
  readWorkspaces,
  validateHotfix,
} from "./policy";
import { git } from "./process";

const event = JSON.parse(
  readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")
);
const pr = event.pull_request;
if (!pr) {
  throw new Error("Expected pull_request event");
}
const base = git("merge-base", pr.base.sha, pr.head.sha);
const files = git("diff", "--name-only", base, pr.head.sha).split("\n");
const added = git(
  "diff",
  "--name-only",
  "--diff-filter=AM",
  base,
  pr.head.sha,
  "--",
  ".changeset/*.md"
)
  .split("\n")
  .filter((file) => file && !file.endsWith("README.md"));
const changesets = added.map((file) =>
  parseChangeset(git("show", `${pr.head.sha}:${file}`))
);
validateHotfix(pr.head.ref, changesets);
// Release and back-merge PRs carry already reviewed versioning history.
const reviewedHistory =
  pr.head.repo.full_name === pr.base.repo.full_name &&
  (pr.head.ref === "next" ||
    pr.head.ref === "changeset-release/main" ||
    pr.head.ref === "release/self-hosted" ||
    (pr.base.ref === "next" && pr.head.ref.startsWith("back-merge/")));
if (!reviewedHistory) {
  const covered = new Set(
    changesets.flatMap((entry) => Object.keys(entry.releases))
  );
  const affected = affectedTargets(files, readWorkspaces());
  const required = affected.filter((name) => name.startsWith("@lunarisapp/"));
  const config = JSON.parse(readFileSync(".changeset/config.json", "utf8")) as {
    ignore: string[];
  };
  const missing = required.filter(
    (name) => !(config.ignore.includes(name) || covered.has(name))
  );
  if (missing.length) {
    throw new Error(
      `Add changesets for affected release targets: ${missing.join(", ")}`
    );
  }
}
