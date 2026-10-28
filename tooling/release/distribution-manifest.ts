import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

export type DistributionComponent =
  | "cli"
  | "desktop"
  | "desktop-windows"
  | "desktop-linux";
export type DistributionSigningMode = "adhoc" | "signed" | "unsigned";

interface BuildManifestOptions {
  component: DistributionComponent;
  distDirectory: string;
  prefix: string;
  signingMode: DistributionSigningMode;
  sourceCommit: string;
  version: string;
}

interface DistributionManifest {
  artifacts: Array<{
    format: "dmg" | "zip" | "exe" | "deb";
    name: string;
    objectKey: string;
    sha256: string;
    size: number;
    target:
      | "universal-apple-darwin"
      | "x86_64-pc-windows-msvc"
      | "x86_64-unknown-linux-gnu";
  }>;
  component: DistributionComponent;
  minimumSystemVersion?: "13.0";
  schemaVersion: 1;
  signingMode: DistributionSigningMode;
  sourceCommit: string;
  tag: string;
  version: string;
}

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*))(?:\.(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*)))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function isDistributionVersion(version: string): boolean {
  return semverPattern.test(version);
}

export function normalizeDistributionPrefix(prefix: string): string {
  const normalized = prefix.replace(/^\/+|\/+$/g, "");
  const segments = normalized.split("/");
  if (
    !normalized ||
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        !/^[0-9A-Za-z._-]+$/.test(segment)
    )
  ) {
    throw new Error(`Invalid distribution prefix: ${prefix}`);
  }
  return normalized;
}

export function expectedAssetName(
  component: DistributionComponent,
  version: string,
  signingMode: DistributionSigningMode
): string {
  if (component === "desktop-windows" || component === "desktop-linux") {
    if (signingMode !== "unsigned") {
      throw new Error(
        "Windows and Linux installers require unsigned signing mode"
      );
    }
    return component === "desktop-windows"
      ? `Lunaris-desktop-${version}-x86_64-pc-windows-msvc.exe`
      : `Lunaris-desktop-${version}-x86_64-unknown-linux-gnu.deb`;
  }
  if (signingMode === "unsigned") {
    throw new Error("macOS artifacts require signed or adhoc signing mode");
  }
  const unsignedSuffix = signingMode === "adhoc" ? "-adhoc" : "";
  return component === "cli"
    ? `lunaris-cli-${version}-universal-apple-darwin${unsignedSuffix}.zip`
    : `Lunaris-desktop-${version}-universal${unsignedSuffix}.dmg`;
}

export function checksumForAsset(
  checksumFile: string,
  assetName: string
): string {
  const matches = checksumFile
    .split(/\r?\n/)
    .map((line) => line.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .filter((match) => match[2] === assetName);

  const checksum = matches[0]?.[1];
  if (matches.length !== 1 || !checksum) {
    throw new Error(
      `Expected one SHA256SUMS entry for ${assetName}; found ${matches.length}`
    );
  }
  return checksum.toLowerCase();
}

export function buildDistributionManifest({
  component,
  distDirectory,
  prefix,
  signingMode,
  sourceCommit,
  version,
}: BuildManifestOptions): DistributionManifest {
  if (!isDistributionVersion(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    throw new Error(`Invalid source commit: ${sourceCommit}`);
  }

  const normalizedPrefix = normalizeDistributionPrefix(prefix);
  const assetName = expectedAssetName(component, version, signingMode);
  const distFiles = readdirSync(distDirectory);
  if (!distFiles.includes(assetName)) {
    throw new Error(`Missing release asset: ${assetName}`);
  }

  const checksumPath = resolve(distDirectory, "SHA256SUMS");
  const sha256 = checksumForAsset(
    readFileSync(checksumPath, "utf8"),
    assetName
  );
  const assetPath = resolve(distDirectory, assetName);

  return {
    schemaVersion: 1,
    component,
    version,
    tag:
      process.env.PRODUCT_RELEASE === "true"
        ? `v${version}`
        : `${component}@${version}`,
    sourceCommit,
    signingMode,
    ...(component === "cli" || component === "desktop"
      ? { minimumSystemVersion: "13.0" as const }
      : {}),
    artifacts: [
      {
        name: basename(assetPath),
        objectKey: `${normalizedPrefix}/${component}/${version}/${assetName}`,
        target:
          component === "desktop-windows"
            ? "x86_64-pc-windows-msvc"
            : component === "desktop-linux"
              ? "x86_64-unknown-linux-gnu"
              : "universal-apple-darwin",
        format:
          component === "cli"
            ? "zip"
            : component === "desktop"
              ? "dmg"
              : component === "desktop-windows"
                ? "exe"
                : "deb",
        size: statSync(assetPath).size,
        sha256,
      },
    ],
  };
}

if (import.meta.main) {
  const [component, version, signingMode, distDirectory] =
    process.argv.slice(2);
  if (
    (component !== "cli" &&
      component !== "desktop" &&
      component !== "desktop-windows" &&
      component !== "desktop-linux") ||
    !version ||
    (signingMode !== "signed" &&
      signingMode !== "adhoc" &&
      signingMode !== "unsigned") ||
    !distDirectory
  ) {
    throw new Error(
      "Usage: distribution-manifest.ts <cli|desktop|desktop-windows|desktop-linux> <version> <signed|adhoc|unsigned> <dist-directory>"
    );
  }

  const sourceCommit = process.env.LUNARIS_BUILD_SHA ?? process.env.GITHUB_SHA;
  if (!sourceCommit) {
    throw new Error("GITHUB_SHA is required");
  }

  const manifest = buildDistributionManifest({
    component,
    version,
    signingMode,
    distDirectory: resolve(distDirectory),
    prefix: "releases",
    sourceCommit,
  });
  console.log(JSON.stringify(manifest, null, 2));
}
