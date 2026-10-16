import { readdirSync } from "node:fs";
import path from "node:path";

const GENERATED_WORKBOX_FILE = /^workbox-[A-Za-z0-9_-]+\.js$/;
export const NETWORK_ONLY_DISCOVERY_URLS = [
  ".well-known/lunaris-servers",
  ".well-known/lunaris-regions",
];

function normalizeAssetUrl(url: string): string {
  return url.replace(/^\/+/, "").replaceAll(path.sep, "/");
}

export function extractUniquePrecacheUrls(serviceWorker: string): Set<string> {
  return new Set(
    [...serviceWorker.matchAll(/\burl:"([^"]+)"/g)].map(([, url]) =>
      normalizeAssetUrl(url ?? "")
    )
  );
}

export function isGeneratedServiceWorkerFile(url: string): boolean {
  const normalizedUrl = normalizeAssetUrl(url);
  return (
    normalizedUrl === "sw.js" || GENERATED_WORKBOX_FILE.test(normalizedUrl)
  );
}

export function findMissingPrecacheUrls(
  distUrls: Iterable<string>,
  precacheUrls: Iterable<string>
): string[] {
  const cached = new Set(
    [...precacheUrls].map((url) => normalizeAssetUrl(url))
  );
  return [...new Set([...distUrls].map((url) => normalizeAssetUrl(url)))]
    .filter(
      (url) =>
        !(
          isGeneratedServiceWorkerFile(url) ||
          NETWORK_ONLY_DISCOVERY_URLS.includes(url) ||
          cached.has(url)
        )
    )
    .sort();
}

export function collectDistFileUrls(
  directory: string,
  relativeDirectory = ""
): string[] {
  const files: string[] = [];
  const currentDirectory = path.join(directory, relativeDirectory);

  for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectDistFileUrls(directory, relativePath));
    } else if (entry.isFile()) {
      files.push(normalizeAssetUrl(relativePath));
    }
  }

  return files;
}
