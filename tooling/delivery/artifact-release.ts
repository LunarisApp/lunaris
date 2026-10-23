import { existsSync, writeFileSync } from "node:fs";
import { git, output, run } from "../release/automation/process";
import { verifyTrunk } from "./github";
import { readManifest } from "../release/automation/manifest";

const mode = process.argv[2];
const family = process.env.RELEASE_FAMILY;
if (family !== "npm" && family !== "self-hosted") {
  throw new Error("Expected release family");
}
const path = `.release/${family}.json`;
if (mode === "plan") {
  if (!existsSync(path)) {
    output("enabled", "false");
    process.exit(0);
  }
  // Drain pending versions oldest first even after newer version PRs merge.
  const commits = git(
    "log",
    "--first-parent",
    "--reverse",
    "--format=%H",
    "--",
    path
  )
    .split("\n")
    .filter(Boolean);
  for (const sha of commits) {
    const manifest = JSON.parse(git("show", `${sha}:${path}`)) as {
      releases: { tag: string; kind: string }[];
    };
    let pending = false;
    for (const entry of manifest.releases) {
      if (entry.kind !== family) {
        throw new Error("Unexpected manifest family");
      }
      const release = run(
        "gh",
        ["release", "view", entry.tag, "--json", "isDraft"],
        { allowFailure: true }
      );
      if (release.ok) {
        pending ||= Boolean(JSON.parse(release.text).isDraft);
      } else if (/not found|HTTP 404/i.test(release.stderr)) {
        pending = true;
      } else {
        throw new Error(`Cannot inspect release ${entry.tag}`);
      }
    }
    if (pending) {
      verifyTrunk(sha);
      output("enabled", "true");
      output("sha", sha);
      process.exit(0);
    }
  }
  output("enabled", "false");
} else if (mode === "tags") {
  const sha = git("rev-parse", "HEAD");
  verifyTrunk(sha);
  for (const entry of readManifest().releases) {
    const previous = run(
      "git",
      ["rev-parse", "--verify", `refs/tags/${entry.tag}^{commit}`],
      { allowFailure: true }
    );
    if (previous.ok && previous.text !== sha) {
      throw new Error(`Tag ${entry.tag} points elsewhere`);
    }
    if (!previous.ok) {
      git("tag", entry.tag, sha);
      git("push", "origin", `refs/tags/${entry.tag}`);
    }
    const release = run("gh", ["release", "view", entry.tag], {
      allowFailure: true,
    });
    if (!release.ok) {
      if (!/not found|HTTP 404/i.test(release.stderr)) {
        throw new Error(`Cannot inspect ${entry.tag}`);
      }
      const notes = `${process.env.RUNNER_TEMP ?? "/tmp"}/notes.md`;
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
} else {
  throw new Error("Expected plan or tags");
}
