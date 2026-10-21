import { readManifest } from "./manifest";
import { git, run, summary } from "./process";

/** Explicit recovery after a reviewed automation-only fix, before any tagging. */
export function repairUntaggedRelease() {
  git("fetch", "origin", "main", "--tags");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    throw new Error("Repair requires current main");
  }
  const previous = git(
    "log",
    "-1",
    "--format=%H",
    "HEAD",
    "--",
    ".release/manifest.json"
  );
  if (!previous || previous === git("rev-parse", "HEAD")) {
    throw new Error("No automation fix follows the pending release");
  }
  if (
    git("log", "-1", "--format=%s", previous) !==
    "chore(release): version packages"
  ) {
    throw new Error("Previous manifest is not a version commit");
  }
  const manifest = readManifest();
  if (
    !manifest.releases.length ||
    git("rev-parse", `${previous}^`) !== manifest.sourceCommit
  ) {
    throw new Error("Invalid pending release provenance");
  }
  const changed = git("diff", "--name-only", previous, "HEAD")
    .split("\n")
    .filter(Boolean);
  if (
    !changed.length ||
    changed.some(
      (path) =>
        !/^(\.github\/workflows\/|tooling\/ci\/|tooling\/release\/automation\/|docs\/procedures\/releasing-and-deploying\.md$)/.test(
          path
        )
    )
  ) {
    throw new Error(
      "Repair permits reviewed CI/release tooling changes only; shipped inputs changed"
    );
  }
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    throw new Error("GITHUB_REPOSITORY required");
  }
  // List succeeds or throws: authorization/network failures are never absence.
  const published = JSON.parse(
    run("gh", [
      "api",
      "--paginate",
      `repos/${repository}/releases?per_page=100`,
    ]).text.replace(/\]\s*\[/g, ",")
  ) as { tag_name: string }[];
  for (const entry of manifest.releases) {
    if (
      run("git", ["rev-parse", "--verify", `refs/tags/${entry.tag}`], {
        allowFailure: true,
      }).ok ||
      published.some(({ tag_name }) => tag_name === entry.tag)
    ) {
      throw new Error(
        `Cannot repair ${entry.tag}: tag or release already exists; recover original commit`
      );
    }
  }
  summary(
    `Repairing untagged release ${previous}; preserving versions: ${manifest.releases.map(({ tag }) => tag).join(", ")}. Full validation required before tagging.`
  );
  return manifest.releases;
}
