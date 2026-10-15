import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  collectDistFileUrls,
  extractUniquePrecacheUrls,
  findMissingPrecacheUrls,
} from "./pwa-build-assertions";

const MAX_INITIAL_JS_GZIP_BYTES = 650 * 1024;
const MAX_PRECACHE_BYTES = 60 * 1024 * 1024;
const MAX_PRECACHE_ENTRIES = 700;
const FORBIDDEN_INITIAL_CHUNK =
  /(?:workspace-(?:desktop|mobile)-shell|powersync-web|host-)/;

const distDirectory = path.resolve(import.meta.dirname, "../dist");
const html = readFileSync(path.join(distDirectory, "index.html"), "utf8");
const serviceWorker = readFileSync(path.join(distDirectory, "sw.js"), "utf8");

const initialJsUrls = [
  ...new Set(
    [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+\.js)"[^>]*>/g)].map(
      ([, url]) => url,
    ),
  ),
];
if (initialJsUrls.length === 0) {
  throw new Error("No startup JavaScript found in index.html");
}

const forbiddenInitialUrl = initialJsUrls.find((url) =>
  FORBIDDEN_INITIAL_CHUNK.test(url),
);
if (forbiddenInitialUrl) {
  throw new Error(`Editor-only chunk loaded at startup: ${forbiddenInitialUrl}`);
}

const initialJsGzipBytes = initialJsUrls.reduce((total, url) => {
  const file = readFileSync(path.join(distDirectory, url.replace(/^\//, "")));
  return total + gzipSync(file).byteLength;
}, 0);
if (initialJsGzipBytes > MAX_INITIAL_JS_GZIP_BYTES) {
  throw new Error(
    `Initial JS is ${(initialJsGzipBytes / 1024).toFixed(1)} KiB gzip; limit is 650 KiB`,
  );
}

const precacheUrls = extractUniquePrecacheUrls(serviceWorker);
if (precacheUrls.size === 0) {
  throw new Error("No precache entries found in sw.js");
}

const distFileUrls = collectDistFileUrls(distDirectory);
const missingPrecacheUrls = findMissingPrecacheUrls(
  distFileUrls,
  precacheUrls,
);
if (missingPrecacheUrls.length > 0) {
  throw new Error(
    `PWA precache is missing ${missingPrecacheUrls.length} build assets: ${missingPrecacheUrls.slice(0, 10).join(", ")}`,
  );
}

const precacheBytes = [...precacheUrls].reduce(
  (total, url) =>
    total + statSync(path.join(distDirectory, url.replace(/^\//, ""))).size,
  0,
);

if (precacheUrls.size > MAX_PRECACHE_ENTRIES) {
  throw new Error(
    `PWA precache has ${precacheUrls.size} entries; limit is ${MAX_PRECACHE_ENTRIES}`,
  );
}
if (precacheBytes > MAX_PRECACHE_BYTES) {
  throw new Error(
    `PWA precache is ${(precacheBytes / 1024 / 1024).toFixed(2)} MiB; limit is 60 MiB`,
  );
}

console.info(
  `PWA budgets: ${initialJsUrls.length} startup JS files, ${(initialJsGzipBytes / 1024).toFixed(1)} KiB gzip; ${precacheUrls.size} precache entries, ${(precacheBytes / 1024 / 1024).toFixed(2)} MiB`,
);
