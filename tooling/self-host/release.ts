import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { verifyPublicationCommit } from "../release/automation/manifest";
import { output, run, summary } from "../release/automation/process";
import { createBundle } from "./bundle";

interface ImageReceipt {
  api: string;
  platform: "linux/amd64" | "linux/arm64";
  sourceCommit: string;
  web: string;
}
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const { sha, manifest } = verifyPublicationCommit();
const entry = manifest.releases.find(({ kind }) => kind === "self-hosted");
if (process.argv[2] === "prepare") {
  output("enabled", entry ? "true" : "false");
  if (entry) {
    output("version", entry.version);
    output("tag", entry.tag);
  }
} else if (process.argv[2] === "publish" && entry) {
  const directory = resolve(process.argv[3] ?? "artifacts");
  const receipts = ["amd64", "arm64"].map((architecture) => {
    const receipt: ImageReceipt = JSON.parse(
      readFileSync(resolve(directory, architecture, "images.json"), "utf8")
    );
    if (
      receipt.sourceCommit !== sha ||
      receipt.platform !== `linux/${architecture}` ||
      !digestPattern.test(receipt.api) ||
      !digestPattern.test(receipt.web)
    ) {
      throw new Error("Image receipt does not match validated release");
    }
    return receipt;
  });
  const images = {} as Record<"api" | "web", string>;
  for (const service of ["api", "web"] as const) {
    const repository = `ghcr.io/lunarisapp/lunaris-${service}`;
    const tag = `${repository}:${entry.version}`;
    const existing = spawnSync(
      "docker",
      ["buildx", "imagetools", "inspect", tag, "--raw"],
      { encoding: "utf8" }
    );
    if (existing.status === 0) {
      const index = JSON.parse(existing.stdout);
      if (index.annotations?.["org.opencontainers.image.revision"] !== sha) {
        throw new Error(`Refusing to replace an existing image tag: ${tag}`);
      }
    } else {
      if (
        !/not found|manifest unknown|MANIFEST_UNKNOWN/i.test(existing.stderr)
      ) {
        throw new Error(
          `Cannot inspect existing image tag ${tag}; retry after registry access recovers`
        );
      }
      run("docker", [
        "buildx",
        "imagetools",
        "create",
        "--annotation",
        `index:org.opencontainers.image.revision=${sha}`,
        "--tag",
        tag,
        ...receipts.map((receipt) => `${repository}@${receipt[service]}`),
      ]);
    }
    const digest = run("docker", [
      "buildx",
      "imagetools",
      "inspect",
      tag,
      "--format",
      "{{.Manifest.Digest}}",
    ]).text;
    if (!digestPattern.test(digest)) {
      throw new Error(`Invalid published manifest digest: ${service}`);
    }
    images[service] = `${repository}@${digest}`;
  }
  const work = mkdtempSync(resolve(tmpdir(), "lunaris-self-host-release-"));
  // New GHCR packages default to private. Never promote an unusable bundle.
  const anonymousConfig = resolve(work, "anonymous-docker");
  mkdirSync(anonymousConfig);
  for (const reference of Object.values(images)) {
    const anonymous = run(
      "docker",
      ["--config", anonymousConfig, "manifest", "inspect", reference],
      { allowFailure: true }
    );
    if (!anonymous.ok) {
      throw new Error(
        "Release images are not anonymously readable. Make both GHCR packages public, then rerun this job."
      );
    }
  }
  const bundle = resolve(work, "bundle");
  createBundle({
    directory: bundle,
    version: entry.version,
    sourceCommit: sha,
    apiImage: images.api,
    webImage: images.web,
  });
  const archive = resolve(work, `lunaris-self-hosted-${entry.version}.tar.gz`);
  // Deterministic bytes let reruns compare, never overwrite release assets.
  run("tar", [
    "--sort=name",
    "--mtime=@0",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "-czf",
    archive,
    "-C",
    bundle,
    ".",
  ]);
  const hash = (path: string) =>
    createHash("sha256").update(readFileSync(path)).digest("hex");
  const checksums = resolve(work, "SHA256SUMS");
  writeFileSync(checksums, `${hash(archive)}  ${basename(archive)}\n`);
  const release: { assets: { name: string }[] } = JSON.parse(
    run("gh", ["release", "view", entry.tag, "--json", "assets"]).text
  );
  for (const path of [archive, checksums]) {
    const name = basename(path);
    if (release.assets.some((asset) => asset.name === name)) {
      const previous = resolve(work, "previous");
      mkdirSync(previous, { recursive: true });
      run("gh", [
        "release",
        "download",
        entry.tag,
        "--pattern",
        name,
        "--dir",
        previous,
      ]);
      if (hash(resolve(previous, name)) !== hash(path)) {
        throw new Error(`Existing release asset differs: ${name}`);
      }
    } else {
      run("gh", ["release", "upload", entry.tag, path]);
    }
  }
  run("gh", ["release", "edit", entry.tag, "--draft=false", "--latest=false"]);
  summary(`Released ${entry.tag}; source ${sha}; ${basename(archive)}`);
} else {
  throw new Error("Usage: release.ts prepare | publish <artifact-directory>");
}
