import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  applyCacheHeaders,
  applySecurityHeaders,
  buildContentSecurityPolicy,
  createHealthResponse,
  handleRequest,
} from "./serve";

type TrackedEnvKey =
  | "NODE_ENV"
  | "VITE_POSTHOG_API_HOST"
  | "VITE_REGION_DIRECTORY_JSON";

const ORIGINAL_ENV: Record<TrackedEnvKey, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  VITE_POSTHOG_API_HOST: process.env.VITE_POSTHOG_API_HOST,
  VITE_REGION_DIRECTORY_JSON: process.env.VITE_REGION_DIRECTORY_JSON,
};

beforeEach(() => {
  // Pin NODE_ENV so existing "dev wildcard present" assertions are
  // deterministic regardless of what the ambient shell / CI set.
  process.env.NODE_ENV = "development";
  delete process.env.VITE_POSTHOG_API_HOST;
});

afterEach(() => {
  restoreEnv("NODE_ENV", ORIGINAL_ENV.NODE_ENV);
  restoreEnv("VITE_POSTHOG_API_HOST", ORIGINAL_ENV.VITE_POSTHOG_API_HOST);
  restoreEnv(
    "VITE_REGION_DIRECTORY_JSON",
    ORIGINAL_ENV.VITE_REGION_DIRECTORY_JSON
  );
});

function restoreEnv(key: TrackedEnvKey, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

describe("buildContentSecurityPolicy", () => {
  test("uses configured region api origins and runtime wildcards", () => {
    process.env.VITE_REGION_DIRECTORY_JSON = JSON.stringify([
      {
        id: "us",
        label: "United States",
        apiUrl: "https://staging-api.example.com/v1",
        status: "active",
        default: true,
      },
      {
        id: "eu",
        label: "Europe",
        apiUrl: "https://api-eu.example.com",
        status: "coming-soon",
      },
    ]);
    process.env.VITE_POSTHOG_API_HOST = "https://metrics.example.com/ingest";

    const policy = buildContentSecurityPolicy(true);

    expect(policy).toContain(
      "connect-src 'self' blob: https: https://staging-api.example.com https://api-eu.example.com wss://staging-api.example.com wss://api-eu.example.com https://metrics.example.com https://gravatar.com https://t3.storageapi.dev https://lunaris.app https://*.lunaris.app wss://*.lunaris.app"
    );
    expect(policy).toContain(
      "script-src 'self' blob: 'sha256-fCaVxzn99NXIV2Sj1rVbVZxfp8DmlTnAEsbUyIxGxjg=' 'wasm-unsafe-eval' https://metrics.example.com"
    );
    expect(policy).toContain(
      "script-src-elem 'self' blob: 'sha256-fCaVxzn99NXIV2Sj1rVbVZxfp8DmlTnAEsbUyIxGxjg=' 'wasm-unsafe-eval' https://metrics.example.com"
    );
    expect(policy).toContain("frame-src 'self' blob:");
    expect(policy).toContain("font-src 'self' data: blob:");
    expect(policy).toContain(
      "img-src 'self' data: blob: https: https://gravatar.com https://t3.storageapi.dev https://staging-api.example.com https://api-eu.example.com https://*.lunaris.app http://localhost:* http://127.0.0.1:*"
    );
  });

  test("allows separate self-hosted sync and storage origins in production", () => {
    process.env.NODE_ENV = "production";
    process.env.VITE_REGION_DIRECTORY_JSON = JSON.stringify([
      {
        id: "selfhost",
        label: "Self-hosted",
        status: "active",
        apiUrl: "http://localhost:3000",
        syncUrl: "http://localhost:8080/sync",
        storageUrl: "http://localhost:3900/bucket",
      },
    ]);
    const policy = buildContentSecurityPolicy(false);
    const connect = policy
      .split("; ")
      .find((value) => value.startsWith("connect-src "))!;
    const images = policy
      .split("; ")
      .find((value) => value.startsWith("img-src "))!;
    expect(connect).toContain("http://localhost:8080");
    expect(connect).toContain("ws://localhost:8080");
    expect(connect).toContain("http://localhost:3900");
    expect(images).toContain("http://localhost:3900");
    expect(connect).not.toContain("http://localhost:*");
  });

  test("omits upgrade-insecure-requests for local http responses", () => {
    process.env.VITE_REGION_DIRECTORY_JSON = JSON.stringify([
      {
        id: "us",
        label: "United States",
        apiUrl: "http://localhost:3000",
        status: "active",
        default: true,
      },
    ]);

    const policy = buildContentSecurityPolicy(false);

    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(policy).toContain(
      "connect-src 'self' blob: https: http://localhost:3000 ws://localhost:3000 https://gravatar.com https://t3.storageapi.dev https://lunaris.app https://*.lunaris.app wss://*.lunaris.app http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*"
    );
    expect(policy).toContain(
      "img-src 'self' data: blob: https: https://gravatar.com https://t3.storageapi.dev http://localhost:3000 https://*.lunaris.app http://localhost:* http://127.0.0.1:*"
    );
  });

  test("includes upgrade-insecure-requests for https responses", () => {
    const policy = buildContentSecurityPolicy(true);

    expect(policy).toContain("upgrade-insecure-requests");
  });

  test("strips local host wildcards in production", () => {
    process.env.NODE_ENV = "production";
    process.env.VITE_REGION_DIRECTORY_JSON = JSON.stringify([
      {
        id: "us",
        label: "United States",
        apiUrl: "https://api.example.com",
        status: "active",
        default: true,
      },
    ]);

    const policy = buildContentSecurityPolicy(true);

    expect(policy).not.toContain("http://localhost:*");
    expect(policy).not.toContain("ws://localhost:*");
    expect(policy).not.toContain("http://127.0.0.1:*");
    expect(policy).not.toContain("ws://127.0.0.1:*");
    expect(policy).toContain(
      "connect-src 'self' blob: https: https://api.example.com wss://api.example.com https://gravatar.com https://t3.storageapi.dev https://lunaris.app https://*.lunaris.app wss://*.lunaris.app"
    );
    expect(policy).toContain(
      "img-src 'self' data: blob: https: https://gravatar.com https://t3.storageapi.dev https://api.example.com https://*.lunaris.app"
    );
  });

  test("skips invalid or missing env origins", () => {
    process.env.VITE_REGION_DIRECTORY_JSON = "not a url";
    process.env.VITE_POSTHOG_API_HOST = "also not a url";

    const policy = buildContentSecurityPolicy(true);

    expect(policy).not.toContain("not a url");
    expect(policy).not.toContain("null");
    expect(policy).toContain(
      "connect-src 'self' blob: https: https://gravatar.com https://t3.storageapi.dev https://lunaris.app https://*.lunaris.app wss://*.lunaris.app http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*"
    );
    expect(policy).toContain(
      "script-src 'self' blob: 'sha256-fCaVxzn99NXIV2Sj1rVbVZxfp8DmlTnAEsbUyIxGxjg=' 'wasm-unsafe-eval'"
    );
    expect(policy).toContain(
      "script-src-elem 'self' blob: 'sha256-fCaVxzn99NXIV2Sj1rVbVZxfp8DmlTnAEsbUyIxGxjg=' 'wasm-unsafe-eval'"
    );
    expect(policy).toContain(
      "img-src 'self' data: blob: https: https://gravatar.com https://t3.storageapi.dev https://*.lunaris.app http://localhost:* http://127.0.0.1:*"
    );
  });
});

describe("applySecurityHeaders", () => {
  test("writes CSP based on request security state", () => {
    process.env.VITE_REGION_DIRECTORY_JSON = JSON.stringify([
      {
        id: "us",
        label: "United States",
        apiUrl: "https://staging-api.example.com",
        status: "active",
        default: true,
      },
    ]);

    const httpsHeaders = new Headers();
    applySecurityHeaders(httpsHeaders, true);

    const httpHeaders = new Headers();
    applySecurityHeaders(httpHeaders, false);

    expect(httpsHeaders.get("Content-Security-Policy")).toContain(
      "upgrade-insecure-requests"
    );
    expect(httpHeaders.get("Content-Security-Policy")).not.toContain(
      "upgrade-insecure-requests"
    );
  });
});

describe("applyCacheHeaders", () => {
  test.each(["/index.html", "/sw.js", "/manifest.webmanifest"])(
    "prevents stale update-critical responses for %s",
    (pathname) => {
      const headers = new Headers();

      applyCacheHeaders(headers, pathname);

      expect(headers.get("Cache-Control")).toBe(
        "no-cache, no-store, must-revalidate"
      );
    }
  );

  test("prevents caching an SPA fallback under its route URL", () => {
    const headers = new Headers();

    applyCacheHeaders(headers, "/workspace/project", true);

    expect(headers.get("Cache-Control")).toBe(
      "no-cache, no-store, must-revalidate"
    );
  });

  test.each([
    "/assets/index-4EHZV_aK.js",
    "/assets/font-SCI4bEL9.woff2",
    "/workbox-b9acee4e.js",
  ])("caches content-hashed assets immutably for %s", (pathname) => {
    const headers = new Headers();

    applyCacheHeaders(headers, pathname);

    expect(headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  test.each(["/favicon.ico", "/pwa-192x192.png", "/robots.txt"])(
    "revalidates unhashed assets for %s",
    (pathname) => {
      const headers = new Headers();

      applyCacheHeaders(headers, pathname);

      expect(headers.get("Cache-Control")).toBe("no-cache");
    }
  );
});

describe("createHealthResponse", () => {
  test("returns an uncached plain-text readiness response", async () => {
    const response = createHealthResponse(true);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(await response.text()).toBe("ok\n");
  });
});

describe("handleRequest", () => {
  test("serves Railway health checks without redirecting HTTP", async () => {
    const response = await handleRequest(
      new Request("http://railway.internal/health")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
    expect(await response.text()).toBe("ok\n");
  });
});
