import { requireCompletedRelease } from "./incomplete-release";
import { readFileSync } from "node:fs";
import {
  affectedTargets,
  parseChangeset,
  readWorkspaces,
  validateHotfix,
  validateSource,
} from "./policy";
import { git } from "./process";

const event = JSON.parse(
  readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")
);
const pr = event.pull_request;
if (!pr) {
  throw new Error("Expected pull_request event");
}
validateSource(
  pr.base.ref,
  pr.head.ref,
  pr.head.repo.full_name === pr.base.repo.full_name
);
const base = git("merge-base", pr.base.sha, pr.head.sha);
const files = git("diff", "--name-only", base, pr.head.sha).split("\n");
// An automation-only hotfix must remain reviewable while release recovery is blocked.
const repairOnly =
  pr.head.ref.startsWith("hotfix/") &&
  files.every((file: string) =>
    /^(\.github\/workflows\/|tooling\/ci\/|tooling\/release\/automation\/|docs\/procedures\/releasing-and-deploying\.md$)/.test(
      file
    )
  );
if (pr.base.ref === "main" && !pr.draft && !repairOnly) {
  requireCompletedRelease();
}
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
    (pr.base.ref === "next" && pr.head.ref.startsWith("back-merge/")));
if (!reviewedHistory) {
  const covered = new Set(
    changesets.flatMap((entry) => Object.keys(entry.releases))
  );
  const missing = affectedTargets(files, readWorkspaces()).filter(
    (name) => !covered.has(name)
  );
  if (missing.length) {
    throw new Error(
      `Add changesets for affected release targets: ${missing.join(", ")}`
    );
  }
}
