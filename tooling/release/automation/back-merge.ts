import { git, run, summary } from "./process";

git("fetch", "origin", "main", "next");
const sha = git("rev-parse", "HEAD");
if (git("rev-parse", "origin/main") !== sha) {
  throw new Error("Main advanced; rerun release for current main");
}
git("config", "user.name", "lunaris-release[bot]");
git("config", "user.email", "lunaris-release[bot]@users.noreply.github.com");
git("checkout", "-B", "next", "origin/next");
if (
  run("git", ["merge", "--ff-only", sha], { allowFailure: true }).ok ||
  run(
    "git",
    ["merge", "--no-ff", sha, "-m", "chore(release): merge main into next"],
    { allowFailure: true }
  ).ok
) {
  // Normal push rejects concurrent next updates; retry the job after fetching.
  git("push", "origin", "HEAD:next");
  summary(`Back-merged ${sha} into next`);
} else {
  git("merge", "--abort");
  const branch = `back-merge/${sha}`;
  if (
    !run("git", ["ls-remote", "--exit-code", "--heads", "origin", branch], {
      allowFailure: true,
    }).ok
  ) {
    git("push", "origin", `${sha}:refs/heads/${branch}`);
  }
  const prs = JSON.parse(
    run("gh", [
      "pr",
      "list",
      "--base",
      "next",
      "--head",
      branch,
      "--state",
      "open",
      "--json",
      "number",
    ]).text
  );
  if (!prs.length) {
    run("gh", [
      "pr",
      "create",
      "--base",
      "next",
      "--head",
      branch,
      "--title",
      "chore(release): merge main into next",
      "--body",
      "Automatic back-merge conflicted. Resolve conflicts on this branch and merge with a merge commit. Preserve release versions and pending changesets.",
    ]);
  }
  summary(`Back-merge conflict: resolve ${branch} into next`);
}
