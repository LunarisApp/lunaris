import { z } from "zod";
import { candidateSchema } from "./candidate";
import { completeDesktopAssets, desktopAssetNames } from "./desktop-updater";

export const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = left[index]! - right[index]!;
    if (difference) {
      return difference;
    }
  }
  return 0;
}
export function productVersion(tags: string[], requested?: string): string {
  const versions = tags
    .flatMap((tag) => {
      const match = tag.match(
        /^(?:v|(?:api|web|desktop|cli|self-hosted|docs|landing)@)(\d+\.\d+\.\d+)$/
      );
      return match && stableVersion.test(match[1]!) ? [match[1]!] : [];
    })
    .sort(compareVersions);
  const latest = versions.at(-1) ?? "0.0.0";
  const parts = latest.split(".").map(Number);
  const version = requested || `${parts[0]}.${parts[1]}.${parts[2]! + 1}`;
  if (
    !stableVersion.test(version) ||
    version.split(".").some((part) => !Number.isSafeInteger(Number(part))) ||
    compareVersions(version, latest) <= 0
  ) {
    throw new Error(`Stable version must exceed ${latest}`);
  }
  return version;
}
export const productPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: z.string().regex(stableVersion),
    candidate: candidateSchema,
    // Compatibility with release plans reserved before staging was retired.
    stagingDeploymentId: z.number().int().positive().optional(),
  })
  .strict();
export type ProductPlan = z.infer<typeof productPlanSchema>;
const cliPlatformArchives = {
  "cli-windows": "x86_64-pc-windows-msvc.zip",
  "cli-linux": "x86_64-unknown-linux-gnu.tar.gz",
  "cli-linux-arm64": "aarch64-unknown-linux-gnu.tar.gz",
} as const;
export const productGroups = [
  "cli",
  "cli-windows",
  "cli-linux",
  "cli-linux-arm64",
  "desktop",
  "desktop-windows",
  "desktop-linux",
  "self-hosted",
] as const;
export const productGroupSchema = z.enum(productGroups);

export const assetReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: z.string().regex(stableVersion),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    producerRunId: z.string().regex(/^\d+$/),
    group: productGroupSchema,
    assets: z
      .array(
        z
          .object({
            name: z.string().regex(/^[A-Za-z0-9._-]+$/),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict()
      )
      .min(1),
  })
  .strict()
  .superRefine((receipt, context) => {
    const names = receipt.assets.map((asset) => asset.name);
    const { group, version } = receipt;
    let valid: boolean;
    switch (group) {
      case "self-hosted":
        valid =
          names.length === 2 &&
          names.includes("install.sh") &&
          names.includes(`lunaris-self-hosted-${version}.tar.gz`);
        break;
      case "cli":
        valid =
          names.length === 1 &&
          [
            `lunaris-cli-${version}-universal-apple-darwin.zip`,
            `lunaris-cli-${version}-universal-apple-darwin-adhoc.zip`,
          ].includes(names[0]!);
        break;
      case "cli-windows":
      case "cli-linux":
      case "cli-linux-arm64":
        valid =
          names.length === 1 &&
          names[0] === `lunaris-cli-${version}-${cliPlatformArchives[group]}`;
        break;
      default:
        // Legacy receipts remain readable for already reserved releases.
        valid =
          completeDesktopAssets(version, group, names) ||
          (names.length === 1 &&
            (names[0] === desktopAssetNames(version, group).installer ||
              names[0] === desktopAssetNames(version, group, true).installer));
    }
    if (!valid || new Set(names).size !== names.length) {
      context.addIssue({
        code: "custom",
        message: "Incomplete or unexpected product assets",
      });
    }
  });
export function assertSamePlan(existing: ProductPlan, candidate: ProductPlan) {
  if (JSON.stringify(existing) !== JSON.stringify(candidate)) {
    throw new Error(
      "Release already reserved for different source, version or candidate evidence"
    );
  }
}
