import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  checksumForAsset,
  type DistributionComponent,
  type DistributionSigningMode,
  expectedAssetName,
  isDistributionVersion,
} from "./distribution-manifest";

interface HomebrewDefinitionOptions {
  component: DistributionComponent;
  sha256: string;
  signingMode: DistributionSigningMode;
  version: string;
}

interface UpdateHomebrewTapOptions {
  component: DistributionComponent;
  distDirectory: string;
  signingMode: DistributionSigningMode;
  tapDirectory: string;
  version: string;
}

export interface HomebrewDefinition {
  content: string;
  path: "Casks/lunaris.rb" | "Formula/lunaris.rb";
}

export type HomebrewUpdateStatus = "created" | "unchanged" | "updated";

const checksumPattern = /^[0-9a-f]{64}$/;

function adhocFormulaCaveat(): string {
  return `

  def caveats
    <<~EOS
      This preview build uses ad-hoc code signing. macOS may require explicit
      approval in System Settings > Privacy & Security before first use.
    EOS
  end`;
}

function adhocCaskCaveat(): string {
  return `

  caveats <<~EOS
    This preview build uses ad-hoc code signing. macOS may require explicit
    approval in System Settings > Privacy & Security before first launch.
  EOS`;
}

function renderFormula({
  sha256,
  signingMode,
  version,
}: Omit<HomebrewDefinitionOptions, "component">): string {
  const suffix = signingMode === "adhoc" ? "-adhoc" : "";
  return `class Lunaris < Formula
  desc "Native Lunaris control plane CLI and MCP server"
  homepage "https://lunaris.app/"
  url "https://lunaris.app/download/cli/#{version}/" \\
      "lunaris-cli-#{version}-universal-apple-darwin${suffix}.zip"
  version "${version}"
  sha256 "${sha256}"
  license "MIT"

  depends_on macos: :ventura

  def install
    bin.install "lunaris"
    pkgshare.install "LICENSE", "THIRD-PARTY-LICENSES.txt"
  end${signingMode === "adhoc" ? adhocFormulaCaveat() : ""}

  test do
    assert_match version.to_s, shell_output("#{bin}/lunaris --version")
  end
end
`;
}

function renderCask({
  sha256,
  signingMode,
  version,
}: Omit<HomebrewDefinitionOptions, "component">): string {
  const suffix = signingMode === "adhoc" ? "-adhoc" : "";
  return `cask "lunaris" do
  version "${version}"
  sha256 "${sha256}"

  url "https://lunaris.app/download/macos/#{version}/" \\
      "Lunaris-desktop-#{version}-universal${suffix}.dmg"
  name "Lunaris"
  desc "Offline-first collaborative word processor"
  homepage "https://lunaris.app/"

  depends_on macos: :ventura

  app "Lunaris.app"${signingMode === "adhoc" ? adhocCaskCaveat() : ""}
end
`;
}

export function renderHomebrewDefinition(
  options: HomebrewDefinitionOptions
): HomebrewDefinition {
  if (!isDistributionVersion(options.version)) {
    throw new Error(`Invalid Homebrew version: ${options.version}`);
  }
  if (!checksumPattern.test(options.sha256)) {
    throw new Error("Invalid Homebrew SHA-256");
  }

  return options.component === "cli"
    ? {
        path: "Formula/lunaris.rb",
        content: renderFormula(options),
      }
    : {
        path: "Casks/lunaris.rb",
        content: renderCask(options),
      };
}

function readDefinitionVersion(content: string, path: string): string {
  const version = content.match(/^\s*version "([^"]+)"$/m)?.[1];
  if (!(version && isDistributionVersion(version))) {
    throw new Error(`Cannot read existing Homebrew version from ${path}`);
  }
  return version;
}

export function updateHomebrewTap({
  component,
  distDirectory,
  signingMode,
  tapDirectory,
  version,
}: UpdateHomebrewTapOptions): {
  definition: HomebrewDefinition;
  status: HomebrewUpdateStatus;
} {
  const assetName = expectedAssetName(component, version, signingMode);
  const assetPath = resolve(distDirectory, assetName);
  const checksumPath = resolve(distDirectory, "SHA256SUMS");
  if (!(existsSync(assetPath) && existsSync(checksumPath))) {
    throw new Error(`Homebrew release inputs are missing for ${assetName}`);
  }

  const sha256 = checksumForAsset(
    readFileSync(checksumPath, "utf8"),
    assetName
  );
  const definition = renderHomebrewDefinition({
    component,
    sha256,
    signingMode,
    version,
  });
  const destination = resolve(tapDirectory, definition.path);

  if (existsSync(destination)) {
    const current = readFileSync(destination, "utf8");
    const currentVersion = readDefinitionVersion(current, definition.path);
    const order = Bun.semver.order(currentVersion, version);
    if (order > 0) {
      throw new Error(
        `Refusing to downgrade ${definition.path} from ${currentVersion} to ${version}`
      );
    }
    if (order === 0) {
      if (current !== definition.content) {
        throw new Error(
          `Conflicting Homebrew definition for ${definition.path} ${version}`
        );
      }
      return { definition, status: "unchanged" };
    }
  }

  mkdirSync(resolve(destination, ".."), { recursive: true });
  const status = existsSync(destination) ? "updated" : "created";
  writeFileSync(destination, definition.content);
  return { definition, status };
}

if (import.meta.main) {
  const [component, version, signingMode, distDirectory, tapDirectory] =
    process.argv.slice(2);
  if (
    (component !== "cli" && component !== "desktop") ||
    !version ||
    (signingMode !== "signed" && signingMode !== "adhoc") ||
    !distDirectory ||
    !tapDirectory
  ) {
    throw new Error(
      "Usage: homebrew.ts <cli|desktop> <version> <signed|adhoc> <dist-directory> <tap-directory>"
    );
  }

  const result = updateHomebrewTap({
    component,
    version,
    signingMode,
    distDirectory: resolve(distDirectory),
    tapDirectory: resolve(tapDirectory),
  });
  console.log(
    JSON.stringify({
      path: result.definition.path,
      status: result.status,
    })
  );
}
