import { imageConfig } from "./image";
import { readFileSync, readdirSync } from "node:fs";
import { run, summary } from "../release/automation/process";
import { remoteTags } from "./remote";
import { publicationTags, versionFromTag } from "./tags";

const { image, prefix, app } = imageConfig();
const tag = process.env.IMAGE_TAG ?? "";
const sha = process.env.IMAGE_SHA ?? "";
const version = versionFromTag(tag, prefix);
const remote = remoteTags();
if (remote.get(tag) !== sha) {
  throw new Error("Release tag is missing or moved on origin");
}
const tags = publicationTags(tag, sha, [...remote.keys()], prefix);
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const architectures = ["amd64", "arm64"] as const;
type Manifest = {
  digest: string;
  manifests?: {
    digest: string;
    platform?: { os: string; architecture: string };
  }[];
};

function inspect(reference: string) {
  return JSON.parse(
    run("docker", [
      "buildx",
      "imagetools",
      "inspect",
      reference,
      "--format",
      "{{json .Manifest}}",
    ]).text
  ) as Manifest;
}

function pinned(digest: string) {
  if (!digestPattern.test(digest)) {
    throw new Error("Invalid image digest");
  }
  return `${image}@${digest}`;
}

function verify(manifest: Manifest, architecture: string) {
  const digest = manifest.manifests
    ? manifest.manifests.find(
        (entry) =>
          entry.platform?.os === "linux" &&
          entry.platform.architecture === architecture
      )?.digest
    : manifest.digest;
  if (!digest) {
    throw new Error(`Image missing ${architecture}`);
  }
  const config = JSON.parse(
    run("docker", [
      "buildx",
      "imagetools",
      "inspect",
      pinned(digest),
      "--format",
      "{{json .Image}}",
    ]).text
  );
  if (
    config.os !== "linux" ||
    config.architecture !== architecture ||
    config.config?.Labels?.["org.opencontainers.image.revision"] !== sha ||
    config.config?.Labels?.["org.opencontainers.image.version"] !== version
  ) {
    throw new Error(
      `Image ${architecture} source/version/platform mismatch; bump image version if already published`
    );
  }
}

// Resolve once, then verify and promote by digest. Never rewrite an existing version.
const existing = Bun.spawnSync([
  "docker",
  "buildx",
  "imagetools",
  "inspect",
  `${image}:${version}`,
  "--format",
  "{{json .Manifest}}",
]);
let release: Manifest;
if (existing.exitCode === 0) {
  release = JSON.parse(existing.stdout.toString()) as Manifest;
} else {
  if (!existing.stderr.toString().includes("not found")) {
    throw new Error(
      `Cannot inspect existing release: ${existing.stderr.toString()}`
    );
  }
  const files = readdirSync(".context/image-digests").sort();
  if (files.join(",") !== architectures.join(",")) {
    throw new Error("Both named architecture digests required");
  }
  const sources = architectures.map((architecture) => {
    const reference = pinned(
      readFileSync(`.context/image-digests/${architecture}`, "utf8").trim()
    );
    verify(inspect(reference), architecture);
    return reference;
  });
  run("docker", [
    "buildx",
    "imagetools",
    "create",
    "--tag",
    `${image}:${version}`,
    ...sources,
  ]);
  release = inspect(`${image}:${version}`);
}
for (const architecture of architectures) {
  verify(release, architecture);
}
const reference = pinned(release.digest);
const aliases = tags.filter((name) => name !== version);
run("docker", [
  "buildx",
  "imagetools",
  "create",
  ...aliases.flatMap((name) => ["--tag", `${image}:${name}`]),
  reference,
]);
summary(
  `Lunaris ${app} Community: ${sha}\n\nDigest: \`${reference}\`\n\n${tags.map((name) => `- \`${image}:${name}\``).join("\n")}`
);
