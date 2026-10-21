import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { manifestPath, readManifest, verifyReleaseCommit } from "./manifest";
import { git, output, run, summary } from "./process";
import { versionTargets } from "./version";

const repository = process.env.GITHUB_REPOSITORY;
if (!repository) {
  throw new Error("GITHUB_REPOSITORY required");
}
const mode = process.argv[2];
if (mode === "version") {
  git("fetch", "origin", "main");
  const requested = git("rev-parse", "HEAD");
  const current = git("rev-parse", "origin/main");
  // Re-running the original merge run resumes its already-pushed version commit.
  if (requested !== current) {
    git("checkout", "--detach", current);
    if (
      !existsSync(manifestPath) ||
      readManifest().sourceCommit !== requested
    ) {
      throw new Error("A newer main exists; refusing stale release");
    }
    verifyReleaseCommit();
  } else if (
    git("log", "-1", "--format=%s") === "chore(release): version packages"
  ) {
    verifyReleaseCommit();
  } else {
    const releases = versionTargets();
    if (!releases.length) {
      output("sha", requested);
      output("publish", "false");
      process.exit(0);
    }
    run("bun", ["install", "--lockfile-only", "--ignore-scripts"]);
    mkdirSync(".release", { recursive: true });
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ sourceCommit: requested, releases }, null, 2)}\n`
    );
    run("bun", [
      "x",
      "biome",
      "format",
      "--write",
      manifestPath,
      ...releases.map((entry) => `${entry.path}/package.json`),
    ]);
    git("config", "user.name", "lunaris-release[bot]");
    git(
      "config",
      "user.email",
      "lunaris-release[bot]@users.noreply.github.com"
    );
    git(
      "add",
      ".changeset",
      "apps",
      "packages",
      "internal",
      "extensions",
      "ee",
      "infra",
      "bun.lock",
      manifestPath
    );
    git("commit", "-m", "chore(release): version packages");
    git("push", "origin", "HEAD:main");
  }
  output("sha", git("rev-parse", "HEAD"));
  output("publish", "true");
} else if (mode === "tags") {
  const { sha, manifest } = verifyReleaseCommit();
  for (const entry of manifest.releases) {
    const existing = run(
      "git",
      ["rev-parse", "--verify", `refs/tags/${entry.tag}^{commit}`],
      { allowFailure: true }
    );
    if (existing.ok && existing.text !== sha) {
      throw new Error(`Tag ${entry.tag} points at another commit`);
    }
    if (!existing.ok) {
      git("tag", entry.tag, sha);
      git("push", "origin", `refs/tags/${entry.tag}`);
    }
    const releases = JSON.parse(
      run("gh", [
        "api",
        "--paginate",
        `repos/${repository}/releases?per_page=100`,
      ]).text.replace(/\]\s*\[/g, ",")
    ) as { tag_name: string }[];
    if (!releases.some((release) => release.tag_name === entry.tag)) {
      const notes = `${process.env.RUNNER_TEMP ?? "/tmp"}/release-notes.md`;
      writeFileSync(notes, `${entry.notes}\n\nSource: ${sha}\n`);
      run("gh", [
        "release",
        "create",
        entry.tag,
        "--verify-tag",
        "--draft",
        "--title",
        entry.tag,
        "--notes-file",
        notes,
      ]);
    }
  }

  summary(
    `Tagged (publication pending): ${sha}\n\n${manifest.releases.map((entry) => `- ${entry.tag}`).join("\n")}`
  );
} else {
  throw new Error("Expected version or tags");
}
