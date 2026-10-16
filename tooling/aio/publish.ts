import { readFileSync, readdirSync } from "node:fs";
import { git, run, summary } from "../release/automation/process";
import { publicationTags, versionFromTag } from "./tags";

const image = "lunarisapp/lunaris-aio";
const tag = process.env.AIO_TAG ?? "";
const sha = process.env.AIO_SHA ?? "";
const version = versionFromTag(tag);
git("fetch", "origin", "--tags");
if (git("rev-parse", `refs/tags/${tag}^{commit}`) !== sha) {
  throw new Error("Release tag moved during publication");
}
const tags = publicationTags(
  tag,
  sha,
  git("tag", "--list", "aio-v*").split("\n")
);
const sources = readdirSync(".context/aio-digests").map((file) => {
  const digest = readFileSync(`.context/aio-digests/${file}`, "utf8").trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error("Invalid image digest");
  }
  return `${image}@${digest}`;
});
if (sources.length !== 2) {
  throw new Error("Both architecture digests required");
}

// Preserve an already published version on retries; never rebuild over it.
const existing = Bun.spawnSync([
  "docker",
  "buildx",
  "imagetools",
  "inspect",
  `${image}:${version}`,
  "--raw",
]);
let publishSources = sources;
if (existing.exitCode === 0) {
  const index = JSON.parse(existing.stdout.toString()) as {
    manifests?: {
      digest: string;
      platform?: { os: string; architecture: string };
    }[];
  };
  for (const architecture of ["amd64", "arm64"]) {
    const manifest = index.manifests?.find(
      (entry) =>
        entry.platform?.os === "linux" &&
        entry.platform.architecture === architecture
    );
    if (!manifest) {
      throw new Error(`Existing version missing ${architecture}`);
    }
    const config = JSON.parse(
      run("docker", [
        "buildx",
        "imagetools",
        "inspect",
        `${image}@${manifest.digest}`,
        "--format",
        "{{json .Image}}",
      ]).text
    );
    if (
      config.config?.Labels?.["org.opencontainers.image.revision"] !== sha ||
      config.config?.Labels?.["org.opencontainers.image.version"] !== version
    ) {
      throw new Error(
        "Existing version belongs to different source; bump AIO version"
      );
    }
  }
  publishSources = [`${image}:${version}`];
} else if (!existing.stderr.toString().includes("not found")) {
  throw new Error(
    `Cannot inspect existing release: ${existing.stderr.toString()}`
  );
}
const args = tags.flatMap((name) => ["--tag", `${image}:${name}`]);
run("docker", ["buildx", "imagetools", "create", ...args, ...publishSources]);
run("docker", ["buildx", "imagetools", "inspect", `${image}:${version}`], {
  inheritOutput: true,
});
summary(
  `AIO Community: ${sha}\n\n${tags.map((name) => `- \`${image}:${name}\``).join("\n")}`
);
