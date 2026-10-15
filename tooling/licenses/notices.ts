import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import overrides from "./overrides.json";
import reviewRequired from "./review-required.json";

const noticeName = /^(licen[sc]e|notice|copying|copyright)([._-]|$)/i;
const piPackages = new Set([
  "@mariozechner/pi-coding-agent",
  "@mariozechner/pi-ai",
  "@mariozechner/pi-agent-core",
  "@mariozechner/pi-tui",
]);

interface PackageMetadata {
  license?: string | { type: string };
  name?: string;
  version?: string;
}

function packageRoot(input: string): string | undefined {
  if (input.startsWith("\0")) return;
  const path = input.split("?")[0];
  if (!path || !existsSync(path)) return;
  const actual = realpathSync(path);
  const marker = `${sep}node_modules${sep}`;
  const index = actual.lastIndexOf(marker);
  if (index < 0) return;
  const parts = actual.slice(index + marker.length).split(sep);
  const count = parts[0]?.startsWith("@") ? 2 : 1;
  return join(actual.slice(0, index + marker.length), ...parts.slice(0, count));
}

function readNotices(directory: string): string[] {
  const texts: string[] = [];
  for (const file of readdirSync(directory, { withFileTypes: true }).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (file.isFile() && noticeName.test(file.name)) {
      const text = readFileSync(join(directory, file.name), "utf8").trim();
      if (text) texts.push(`${file.name}\n\n${text}`);
    } else if (file.isDirectory() && /^licenses?$/i.test(file.name)) {
      const licenseDirectory = join(directory, file.name);
      for (const nested of readdirSync(licenseDirectory, {
        recursive: true,
        withFileTypes: true,
      }).sort((a, b) =>
        join(a.parentPath, a.name).localeCompare(join(b.parentPath, b.name)),
      )) {
        if (!nested.isFile()) continue;
        const path = join(nested.parentPath, nested.name);
        const text = readFileSync(path, "utf8").trim();
        if (text) texts.push(`${file.name}/${nested.name}\n\n${text}`);
      }
    }
  }
  return texts;
}

/** Preserve upstream license and NOTICE texts for the actual bundled modules. */
export function collectNotices(
  inputs: string[],
  baseDirectory: string,
): string {
  const directories = new Set<string>();
  for (const input of inputs) {
    if (input.startsWith("\0")) continue;
    const directory = packageRoot(resolve(baseDirectory, input));
    if (directory) directories.add(directory);
  }
  const packages = new Map<string, string>();
  const missing: string[] = [];
  for (const directory of directories) {
    const metadata: PackageMetadata = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf8"),
    );
    const key = `${metadata.name}@${metadata.version}`;
    const notices = readNotices(directory);
    if (
      notices.length === 0 &&
      piPackages.has(metadata.name ?? "") &&
      metadata.version === "0.73.1"
    ) {
      notices.push(
        readFileSync(join(import.meta.dirname, "pi-mono-LICENSE"), "utf8"),
      );
    }
    const override = (
      overrides as Record<string, { file: string; sources: string[] }>
    )[key];
    if (notices.length === 0 && override) {
      notices.push(
        `Source: ${override.sources.join("\n")}\n\n${readFileSync(join(import.meta.dirname, override.file), "utf8")}`,
      );
    }
    const review = (
      reviewRequired as Record<string, { reason: string; repository: string }>
    )[key];
    if (notices.length === 0 && review) {
      notices.push(
        `UPSTREAM LICENSE TEXT REQUIRES REVIEW: ${review.reason}.\nSource: https://github.com/${review.repository}\n\nPublished package metadata (attribution preserved):\n${readFileSync(join(directory, "package.json"), "utf8")}`,
      );
    }
    if (notices.length === 0) {
      missing.push(key);
      continue;
    }
    const license =
      typeof metadata.license === "object"
        ? metadata.license.type
        : metadata.license;
    const section = `## ${key}\n\nDeclared license: ${license ?? "See upstream text below"}\n\n${notices.join("\n\n")}\n`;
    const existing = packages.get(key);
    if (existing && existing !== section)
      throw new Error(`Conflicting license texts for ${key}`);
    packages.set(key, section);
  }
  if (missing.length)
    throw new Error(
      `Missing license text for ${missing.sort().join(", ")}; review upstream before distributing.`,
    );
  if (packages.size === 0)
    throw new Error("No third-party packages found in bundle metadata");
  return `# Third-party software licenses\n\nLicense and attribution texts from bundled packages.\n\n${[
    ...packages,
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => text)
    .join("\n")}`;
}
