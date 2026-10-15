import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderHomebrewDefinition,
  updateHomebrewTap,
} from "./homebrew";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture(assetName: string) {
  const root = mkdtempSync(join(tmpdir(), "lunaris-homebrew-"));
  temporaryDirectories.push(root);
  const distDirectory = join(root, "dist");
  const tapDirectory = join(root, "tap");
  mkdirSync(distDirectory);
  mkdirSync(tapDirectory);
  const contents = `artifact:${assetName}`;
  const sha256 = createHash("sha256").update(contents).digest("hex");
  writeFileSync(join(distDirectory, assetName), contents);
  writeFileSync(
    join(distDirectory, "SHA256SUMS"),
    `${sha256}  ${assetName}\n`
  );
  return { distDirectory, sha256, tapDirectory };
}

describe("renderHomebrewDefinition", () => {
  test("renders a signed CLI formula", () => {
    const definition = renderHomebrewDefinition({
      component: "cli",
      sha256: "a".repeat(64),
      signingMode: "signed",
      version: "1.2.3",
    });

    expect(definition.path).toBe("Formula/lunaris.rb");
    expect(definition.content).toContain('version "1.2.3"');
    expect(definition.content).toContain('sha256 "aaaaaaaa');
    expect(definition.content).toContain(
      "lunaris-cli-#{version}-universal-apple-darwin.zip"
    );
    expect(definition.content).toContain('bin.install "lunaris"');
    expect(definition.content).toContain('license "MIT"');
    expect(definition.content).toContain('pkgshare.install "LICENSE", "THIRD-PARTY-LICENSES.txt"');
    expect(definition.content).not.toContain("ad-hoc code signing");
  });

  test("renders an ad-hoc Desktop cask with a Gatekeeper caveat", () => {
    const definition = renderHomebrewDefinition({
      component: "desktop",
      sha256: "b".repeat(64),
      signingMode: "adhoc",
      version: "2.0.0",
    });

    expect(definition.path).toBe("Casks/lunaris.rb");
    expect(definition.content).toContain(
      "Lunaris-desktop-#{version}-universal-adhoc.dmg"
    );
    expect(definition.content).toContain('app "Lunaris.app"');
    expect(definition.content).toContain("ad-hoc code signing");
  });

  test("rejects invalid versions and checksums", () => {
    expect(() =>
      renderHomebrewDefinition({
        component: "cli",
        sha256: "a".repeat(64),
        signingMode: "signed",
        version: "../latest",
      })
    ).toThrow("Invalid Homebrew version");
    expect(() =>
      renderHomebrewDefinition({
        component: "cli",
        sha256: "invalid",
        signingMode: "signed",
        version: "1.2.3",
      })
    ).toThrow("Invalid Homebrew SHA-256");
  });
});

describe("updateHomebrewTap", () => {
  test("creates and then idempotently accepts an exact formula", () => {
    const assetName = "lunaris-cli-1.2.3-universal-apple-darwin.zip";
    const state = fixture(assetName);
    const input = {
      component: "cli" as const,
      signingMode: "signed" as const,
      version: "1.2.3",
      ...state,
    };

    expect(updateHomebrewTap(input).status).toBe("created");
    expect(updateHomebrewTap(input).status).toBe("unchanged");
    expect(
      readFileSync(join(state.tapDirectory, "Formula/lunaris.rb"), "utf8")
    ).toContain(state.sha256);
  });

  test("updates a definition only for a newer version", () => {
    const first = fixture(
      "Lunaris-desktop-1.2.3-universal-adhoc.dmg"
    );
    updateHomebrewTap({
      component: "desktop",
      distDirectory: first.distDirectory,
      signingMode: "adhoc",
      tapDirectory: first.tapDirectory,
      version: "1.2.3",
    });

    const nextAsset = "Lunaris-desktop-1.3.0-universal.dmg";
    const nextContents = `artifact:${nextAsset}`;
    const nextSha = createHash("sha256").update(nextContents).digest("hex");
    const nextDist = join(first.tapDirectory, "next-dist");
    mkdirSync(nextDist);
    writeFileSync(join(nextDist, nextAsset), nextContents);
    writeFileSync(join(nextDist, "SHA256SUMS"), `${nextSha}  ${nextAsset}\n`);

    expect(
      updateHomebrewTap({
        component: "desktop",
        distDirectory: nextDist,
        signingMode: "signed",
        tapDirectory: first.tapDirectory,
        version: "1.3.0",
      }).status
    ).toBe("updated");
  });

  test("refuses downgrades and same-version conflicts", () => {
    const first = fixture("lunaris-cli-2.0.0-universal-apple-darwin.zip");
    updateHomebrewTap({
      component: "cli",
      distDirectory: first.distDirectory,
      signingMode: "signed",
      tapDirectory: first.tapDirectory,
      version: "2.0.0",
    });

    const formulaPath = join(first.tapDirectory, "Formula/lunaris.rb");
    writeFileSync(
      formulaPath,
      readFileSync(formulaPath, "utf8").replace(
        'sha256 "',
        `# changed\n  sha256 "`
      )
    );
    expect(() =>
      updateHomebrewTap({
        component: "cli",
        distDirectory: first.distDirectory,
        signingMode: "signed",
        tapDirectory: first.tapDirectory,
        version: "2.0.0",
      })
    ).toThrow("Conflicting Homebrew definition");

    const older = fixture("lunaris-cli-1.9.0-universal-apple-darwin.zip");
    expect(() =>
      updateHomebrewTap({
        component: "cli",
        distDirectory: older.distDirectory,
        signingMode: "signed",
        tapDirectory: first.tapDirectory,
        version: "1.9.0",
      })
    ).toThrow("Refusing to downgrade");
  });
});
