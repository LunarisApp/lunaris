import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageManifest {
  name: "cli" | "desktop";
  version: string;
}

interface ReleaseState {
  assets: Array<{ name: string }>;
  draft: boolean;
  tag_name: string;
  target_commitish: string;
}

const root = process.cwd();
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

if (!(repository && token)) {
  throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required");
}

function readPackage(path: string): PackageManifest {
  return JSON.parse(
    readFileSync(resolve(root, path), "utf8")
  ) as PackageManifest;
}

async function github(path: string): Promise<Response> {
  return fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

async function planComponent(manifest: PackageManifest) {
  const tag = `${manifest.name}@${manifest.version}`;
  const releaseResponse = await github(
    `/releases/tags/${encodeURIComponent(tag)}`
  );

  if (releaseResponse.ok) {
    const release = (await releaseResponse.json()) as ReleaseState;
    if (release.draft) {
      throw new Error(
        `${tag} already has a draft release; refusing to overwrite it`
      );
    }
    const escapedVersion = manifest.version.replaceAll(".", "\\.");
    const artifactPattern =
      manifest.name === "cli"
        ? new RegExp(
            `^lunaris-cli-${escapedVersion}-universal-apple-darwin(?:-adhoc)?\\.zip$`
          )
        : new RegExp(
            `^Lunaris-desktop-${escapedVersion}-universal(?:-adhoc)?\\.dmg$`
          );
    const assetNames = release.assets.map(({ name }) => name);
    const artifacts = assetNames.filter((name) => artifactPattern.test(name));
    if (
      artifacts.length !== 1 ||
      !assetNames.includes("SHA256SUMS") ||
      assetNames.length !== 2
    ) {
      throw new Error(
        `${tag} has conflicting assets: ${assetNames.join(", ") || "none"}`
      );
    }
    return {
      component: manifest.name,
      publish: false,
      tag,
      version: manifest.version,
    };
  }

  if (releaseResponse.status !== 404) {
    throw new Error(
      `Cannot inspect ${tag}: ${releaseResponse.status} ${await releaseResponse.text()}`
    );
  }

  const tagResponse = await github(`/git/ref/tags/${encodeURIComponent(tag)}`);
  if (tagResponse.ok) {
    throw new Error(`${tag} exists without a GitHub Release`);
  }
  if (tagResponse.status !== 404) {
    throw new Error(
      `Cannot inspect tag ${tag}: ${tagResponse.status} ${await tagResponse.text()}`
    );
  }

  return {
    component: manifest.name,
    draft: false,
    publish: true,
    tag,
    version: manifest.version,
  };
}

const manifests = [
  readPackage("apps/cli/package.json"),
  readPackage("apps/desktop/package.json"),
];
const target = process.env.NATIVE_TARGET;
if (target && target !== "cli" && target !== "desktop") {
  throw new Error("Invalid native target");
}
const plan = await Promise.all(
  manifests.map((manifest) =>
    target && target !== manifest.name
      ? {
          component: manifest.name,
          publish: false,
          tag: `${manifest.name}@${manifest.version}`,
          version: manifest.version,
        }
      : planComponent(manifest)
  )
);

for (const item of plan) {
  console.log(JSON.stringify(item));
}

if (process.env.GITHUB_OUTPUT) {
  const outputs = plan
    .flatMap((item) => [
      `${item.component}=${item.publish}`,
      `${item.component}_version=${item.version}`,
      `${item.component}_tag=${item.tag}`,
    ])
    .join("\n");
  await Bun.write(process.env.GITHUB_OUTPUT, `${outputs}\n`);
}
