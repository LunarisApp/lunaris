import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDistributionManifest,
  checksumForAsset,
  normalizeDistributionPrefix,
} from "./distribution-manifest";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createDistributionFixture(
  assetName: string,
  contents = "release artifact"
): string {
  const directory = mkdtempSync(join(tmpdir(), "lunaris-release-"));
  temporaryDirectories.push(directory);
  writeFileSync(join(directory, assetName), contents);
  const sha256 = createHash("sha256").update(contents).digest("hex");
  writeFileSync(join(directory, "SHA256SUMS"), `${sha256}  ${assetName}\n`);
  return directory;
}

describe("buildDistributionManifest", () => {
  test("describes a signed CLI artifact at an immutable object key", () => {
    const assetName = "lunaris-cli-1.2.3-universal-apple-darwin.zip";
    const distDirectory = createDistributionFixture(assetName);

    expect(
      buildDistributionManifest({
        component: "cli",
        distDirectory,
        prefix: "/downloads/releases/",
        signingMode: "signed",
        sourceCommit: "a".repeat(40),
        version: "1.2.3",
      })
    ).toEqual({
      schemaVersion: 1,
      component: "cli",
      version: "1.2.3",
      tag: "cli@1.2.3",
      sourceCommit: "a".repeat(40),
      signingMode: "signed",
      minimumSystemVersion: "13.0",
      artifacts: [
        {
          name: assetName,
          objectKey: `downloads/releases/cli/1.2.3/${assetName}`,
          target: "universal-apple-darwin",
          format: "zip",
          size: 16,
          sha256:
            "133cfccb5b503cf4040c95f3dfad56d07c1574283a1e39066b594f6ee33711ba",
        },
      ],
    });
  });

  test("requires the signing mode to match the artifact name", () => {
    const distDirectory = createDistributionFixture(
      "Lunaris-desktop-2.0.0-universal-adhoc.dmg"
    );

    expect(() =>
      buildDistributionManifest({
        component: "desktop",
        distDirectory,
        prefix: "releases",
        signingMode: "signed",
        sourceCommit: "b".repeat(40),
        version: "2.0.0",
      })
    ).toThrow("Missing release asset");
  });

  test.each(["1.2.3-.beta", "1.2.3-beta.", "1.2.3-01"])(
    "rejects invalid SemVer version %s",
    (version) => {
      expect(() =>
        buildDistributionManifest({
          component: "cli",
          distDirectory: createDistributionFixture(
            `lunaris-cli-${version}-universal-apple-darwin.zip`
          ),
          prefix: "releases",
          signingMode: "signed",
          sourceCommit: "c".repeat(40),
          version,
        })
      ).toThrow("Invalid release version");
    }
  );
});

describe("checksumForAsset", () => {
  test("matches only the requested asset", () => {
    const firstHash = "1".repeat(64);
    const secondHash = "2".repeat(64);
    expect(
      checksumForAsset(
        `${firstHash}  first.zip\n${secondHash} *second.zip\n`,
        "second.zip"
      )
    ).toBe(secondHash);
  });
});

describe("normalizeDistributionPrefix", () => {
  test("rejects path traversal", () => {
    expect(() => normalizeDistributionPrefix("releases/../private")).toThrow(
      "Invalid distribution prefix"
    );
  });
});

test("Windows and Linux distribution uses separate channels and unsigned metadata", () => {
  for (const [component, target, format] of [
    ["desktop-windows", "x86_64-pc-windows-msvc", "exe"],
    ["desktop-linux", "x86_64-unknown-linux-gnu", "deb"],
  ] as const) {
    const name = `Lunaris-desktop-1.2.3-${target}.${format}`;
    const options = {
      component,
      distDirectory: createDistributionFixture(name),
      prefix: "releases",
      signingMode: "unsigned" as const,
      sourceCommit: "a".repeat(40),
      version: "1.2.3",
    };
    const manifest = buildDistributionManifest(options);
    expect(manifest.minimumSystemVersion).toBeUndefined();
    expect(manifest.signingMode).toBe("unsigned");
    expect(manifest.artifacts[0]).toMatchObject({
      name,
      target,
      format,
      objectKey: `releases/${component}/1.2.3/${name}`,
    });
    expect(() =>
      buildDistributionManifest({ ...options, signingMode: "signed" })
    ).toThrow("require unsigned");
  }
});
