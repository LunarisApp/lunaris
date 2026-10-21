import type { ReleaseManifest } from "./manifest";
import { git, run, summary } from "./process";

export function incompleteReleaseReasons(
  sha: string,
  manifest: ReleaseManifest,
  backMerged: boolean,
  releases: { tag: string; sha: string | null; published: boolean }[]
) {
  const errors: string[] = [];
  for (const entry of manifest.releases) {
    const release = releases.find(({ tag }) => tag === entry.tag);
    if (release?.sha !== sha) {
      errors.push(`${entry.tag}: missing or mismatched tag`);
    }
    if (!release?.published) {
      errors.push(`${entry.tag}: publication incomplete`);
    }
  }
  if (!backMerged) {
    errors.push(`${sha}: back-merge into next incomplete`);
  }
  return errors;
}

/** Inspect the last manifest-changing commit, even after unrelated main merges. */
export function requireCompletedRelease() {
  git("fetch", "origin", "main", "next", "--tags");
  const sha = git(
    "log",
    "--first-parent",
    "-1",
    "--format=%H",
    "origin/main",
    "--",
    ".release/manifest.json"
  );
  if (!sha) {
    return; // First release has no predecessor.
  }
  const manifest = JSON.parse(
    git("show", `${sha}:.release/manifest.json`)
  ) as ReleaseManifest;
  if (
    !(
      Array.isArray(manifest.releases) &&
      /^[a-f0-9]{40}$/.test(manifest.sourceCommit)
    )
  ) {
    throw new Error("Invalid previous stable release manifest");
  }
  const releases = manifest.releases.map((entry) => {
    const tag = run(
      "git",
      ["rev-parse", "--verify", `refs/tags/${entry.tag}^{commit}`],
      { allowFailure: true }
    );
    const response = run(
      "gh",
      ["release", "view", entry.tag, "--json", "isDraft,isPrerelease"],
      { allowFailure: true }
    );
    // Errors (including unavailable API/auth) fail closed; never assume published.
    const state = response.ok ? JSON.parse(response.text) : null;
    return {
      tag: entry.tag,
      sha: tag.ok ? tag.text : null,
      published: state?.isDraft === false && state?.isPrerelease === false,
    };
  });
  const backMerged = run(
    "git",
    ["merge-base", "--is-ancestor", sha, "origin/next"],
    { allowFailure: true }
  ).ok;
  const errors = incompleteReleaseReasons(sha, manifest, backMerged, releases);
  if (!errors.length) {
    return;
  }
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    throw new Error("GITHUB_REPOSITORY required for release recovery links");
  }
  const runs = JSON.parse(
    run("gh", [
      "run",
      "list",
      "--workflow",
      "release.publish.yml",
      "--limit",
      "100",
      "--json",
      "headSha,url",
    ]).text
  ) as { headSha: string; url: string }[];
  const recovery =
    runs.find(
      (entry) =>
        entry.headSha === sha || entry.headSha === manifest.sourceCommit
    )?.url ??
    `https://github.com/${repository}/actions/workflows/release.publish.yml`;
  const message = `Previous stable release ${sha} is incomplete:\n${errors.map((error) => `- ${error}`).join("\n")}\nRecover existing release before promotion: ${recovery}\nRelease targets: https://github.com/${repository}/releases`;
  summary(message);
  throw new Error(message);
}
