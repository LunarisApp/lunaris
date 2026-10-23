import { verifyTrunk } from "../../delivery/github";
import { readFileSync } from "node:fs";
import { targets } from "./policy";
import { git } from "./process";

export const manifestPath = ["npm", "self-hosted"].includes(
  process.env.RELEASE_FAMILY ?? ""
)
  ? `.release/${process.env.RELEASE_FAMILY}.json`
  : ".release/manifest.json";
export interface ReleaseEntry {
  kind: "npm" | "hosted" | "self-hosted";
  name: string;
  notes: string;
  path: string;
  tag: string;
  version: string;
}
export interface ReleaseManifest {
  releases: ReleaseEntry[];
  sourceCommit: string;
}
export function readManifest(): ReleaseManifest {
  const value = JSON.parse(
    readFileSync(manifestPath, "utf8")
  ) as ReleaseManifest;
  if (process.env.RELEASE_FAMILY) {
    if (
      !["npm", "self-hosted"].includes(process.env.RELEASE_FAMILY) ||
      value.releases.some((entry) => entry.kind !== process.env.RELEASE_FAMILY)
    ) {
      throw new Error("Invalid release family");
    }
    value.sourceCommit = git("rev-parse", "HEAD^");
  }
  if (
    !(
      /^[a-f0-9]{40}$/.test(value.sourceCommit) && Array.isArray(value.releases)
    )
  ) {
    throw new Error("Invalid release manifest");
  }
  const seen = new Set<string>();
  for (const entry of value.releases) {
    const target = targets.find(({ name }) => name === entry.name);
    if (
      !target ||
      target.path !== entry.path ||
      target.kind !== entry.kind ||
      !/^\d+\.\d+\.\d+$/.test(entry.version) ||
      entry.tag !== `${entry.name}@${entry.version}` ||
      typeof entry.notes !== "string" ||
      seen.has(entry.name)
    ) {
      throw new Error("Invalid or duplicate release target");
    }
    seen.add(entry.name);
    const version = JSON.parse(
      readFileSync(`${target.path}/package.json`, "utf8")
    ).version;
    if (version !== entry.version) {
      throw new Error(`Version mismatch: ${entry.name}`);
    }
  }
  return value;
}
export function verifyReleaseCommit() {
  git("fetch", "origin", "main", "--tags");
  const sha = git("rev-parse", "HEAD");
  if (process.env.RELEASE_FAMILY) {
    verifyTrunk(sha);
    return { sha, manifest: readManifest() };
  }
  if (git("rev-parse", "origin/main") !== sha) {
    throw new Error(
      "Only current main can publish; refusing a stale release or rollback"
    );
  }
  const manifest = readManifest();
  if (git("rev-parse", "HEAD^") !== manifest.sourceCommit) {
    throw new Error("Release commit must directly follow its source commit");
  }
  return { sha, manifest };
}

export function verifyPublicationCommit() {
  const release = verifyReleaseCommit();
  for (const entry of release.manifest.releases) {
    if (
      git("rev-parse", "--verify", `refs/tags/${entry.tag}^{commit}`) !==
      release.sha
    ) {
      throw new Error(
        `Tag ${entry.tag} does not match the validated release commit`
      );
    }
  }
  return release;
}
