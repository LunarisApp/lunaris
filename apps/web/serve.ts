import { buildInfo } from "./build-info";
import { normalize, resolve } from "node:path";
import { scrubMaybe } from "@repo/utils";
import type { DrainContext } from "evlog";
import { initLogger, log } from "evlog";
import { createDrainPipeline } from "evlog/pipeline";
import { createPostHogDrain } from "evlog/posthog";

const webServerDrain = process.env.POSTHOG_API_KEY
  ? createDrainPipeline<DrainContext>({
      onDropped: (events, error) => {
        process.stderr.write(
          `${JSON.stringify({
            droppedEvents: events.length,
            error: scrubMaybe(error?.message),
            level: "error",
            message: "PostHog log delivery exhausted retries",
            service: "web",
          })}\n`
        );
      },
    })(createPostHogDrain())
  : undefined;
const commitHash = process.env.RAILWAY_GIT_COMMIT_SHA;

initLogger({
  drain: webServerDrain,
  env: {
    service: "web",
    version: commitHash?.slice(0, 7) ?? "local",
    ...(commitHash ? { commitHash } : {}),
  },
});

const distDir = resolve(import.meta.dir, "dist");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const GRAVATAR_ORIGIN = "https://gravatar.com";
const LUNARIS_ROOT_ORIGIN = "https://lunaris.app";
const STORAGE_ORIGIN = "https://t3.storageapi.dev";
const REVALIDATE_CACHE_CONTROL = "no-cache";
const UPDATE_CACHE_CONTROL = "no-cache, no-store, must-revalidate";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const PLUGIN_SANDBOX_BOOTSTRAP_CSP =
  "'sha256-fCaVxzn99NXIV2Sj1rVbVZxfp8DmlTnAEsbUyIxGxjg='";
const UPDATE_CRITICAL_PATHS = new Set([
  "/index.html",
  "/manifest.webmanifest",
  "/sw.js",
]);
const HASHED_FILE_PATH = /(?:^|\/)[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getRegionDirectoryOrigins(): string[] {
  const value = process.env.VITE_REGION_DIRECTORY_JSON;
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(
      new Set(
        parsed
          .map((entry) =>
            entry &&
            typeof entry === "object" &&
            typeof entry.apiUrl === "string"
              ? getOriginFromValue(entry.apiUrl)
              : null
          )
          .filter((origin): origin is string => Boolean(origin))
      )
    );
  } catch {
    return [];
  }
}

function getOriginFromValue(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getOrigin(envVar: string): string | null {
  return getOriginFromValue(process.env[envVar]);
}

function getForwardedProtocol(req: Request, url: URL): "http" | "https" {
  const xForwardedProto = req.headers.get("x-forwarded-proto");
  if (xForwardedProto) {
    const proto = xForwardedProto.split(",")[0]?.trim().toLowerCase();
    if (proto === "http" || proto === "https") {
      return proto;
    }
  }

  const forwarded = req.headers.get("forwarded");
  if (forwarded) {
    const match = forwarded.match(/(?:^|[;,]\s*)proto=(https?|http)/i);
    const proto = match?.[1]?.toLowerCase();
    if (proto === "http" || proto === "https") {
      return proto;
    }
  }

  const cfVisitor = req.headers.get("cf-visitor");
  if (cfVisitor) {
    const match = cfVisitor.match(/"scheme":"(https?|http)"/i);
    const proto = match?.[1]?.toLowerCase();
    if (proto === "http" || proto === "https") {
      return proto;
    }
  }

  return url.protocol === "https:" ? "https" : "http";
}

function shouldRedirectToHttps(req: Request, url: URL): boolean {
  if (LOCAL_HOSTS.has(url.hostname)) {
    return false;
  }
  return getForwardedProtocol(req, url) === "http";
}

function getAllowedOrigins(...envVars: string[]): string[] {
  return Array.from(
    new Set(
      envVars
        .map((envVar) => getOrigin(envVar))
        .filter((origin): origin is string => Boolean(origin))
    )
  );
}

export function buildContentSecurityPolicy(isHttps: boolean): string {
  const apiOrigins = getRegionDirectoryOrigins();
  const posthogOrigins = getAllowedOrigins("VITE_POSTHOG_API_HOST");
  const localConnectWildcards = isProduction()
    ? []
    : [
        "http://localhost:*",
        "ws://localhost:*",
        "http://127.0.0.1:*",
        "ws://127.0.0.1:*",
      ];
  const localImgWildcards = isProduction()
    ? []
    : ["http://localhost:*", "http://127.0.0.1:*"];
  const connectSrc = new Set([
    "'self'",
    "blob:",
    "https:",
    ...apiOrigins,
    ...apiOrigins.map((origin) => origin.replace(/^http/, "ws")),
    ...posthogOrigins,
    GRAVATAR_ORIGIN,
    STORAGE_ORIGIN,
    LUNARIS_ROOT_ORIGIN,
    "https://*.lunaris.app",
    "wss://*.lunaris.app",
    ...localConnectWildcards,
  ]);
  const scriptSrc = new Set([
    "'self'",
    "blob:",
    PLUGIN_SANDBOX_BOOTSTRAP_CSP,
    "'wasm-unsafe-eval'",
    ...posthogOrigins,
  ]);
  const imgSrc = new Set([
    "'self'",
    "data:",
    "blob:",
    "https:",
    GRAVATAR_ORIGIN,
    STORAGE_ORIGIN,
    ...apiOrigins,
    "https://*.lunaris.app",
    ...localImgWildcards,
  ]);

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    `script-src ${Array.from(scriptSrc).join(" ")}`,
    `script-src-elem ${Array.from(scriptSrc).join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${Array.from(imgSrc).join(" ")}`,
    "font-src 'self' data: blob:",
    `connect-src ${Array.from(connectSrc).join(" ")}`,
  ];

  if (isHttps) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

export function applySecurityHeaders(headers: Headers, isHttps: boolean) {
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(isHttps));
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
  );

  if (isHttps) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
}

export function applyCacheHeaders(
  headers: Headers,
  pathname: string,
  isSpaFallback = false
) {
  if (isSpaFallback || UPDATE_CRITICAL_PATHS.has(pathname)) {
    headers.set("Cache-Control", UPDATE_CACHE_CONTROL);
    return;
  }

  headers.set(
    "Cache-Control",
    HASHED_FILE_PATH.test(pathname)
      ? IMMUTABLE_CACHE_CONTROL
      : REVALIDATE_CACHE_CONTROL
  );
}

function withSecurityHeaders(response: Response, isHttps: boolean): Response {
  applySecurityHeaders(response.headers, isHttps);
  return response;
}

export function createHealthResponse(isHttps: boolean): Response {
  const response = new Response("ok\n", {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain",
      "X-Lunaris-Commit": buildInfo.sha,
      "X-Lunaris-Version": buildInfo.version,
    },
    status: 200,
  });
  return withSecurityHeaders(response, isHttps);
}

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const isHttps = getForwardedProtocol(req, url) === "https";

  if (url.pathname === "/health") {
    return createHealthResponse(isHttps);
  }

  if (shouldRedirectToHttps(req, url)) {
    url.protocol = "https:";
    return Response.redirect(url.toString(), 308);
  }

  const resolved = resolve(distDir, `.${normalize(url.pathname)}`);
  if (!resolved.startsWith(distDir)) {
    return withSecurityHeaders(
      new Response("Forbidden", { status: 403 }),
      isHttps
    );
  }

  const file = Bun.file(resolved);
  if (await file.exists()) {
    const response = new Response(file);
    applyCacheHeaders(response.headers, url.pathname);
    return withSecurityHeaders(response, isHttps);
  }

  const response = new Response(Bun.file(`${distDir}/index.html`));
  applyCacheHeaders(response.headers, url.pathname, true);
  return withSecurityHeaders(response, isHttps);
}

if (import.meta.main) {
  const server = Bun.serve({
    port: Number(process.env.PORT) || 3000,
    fetch: handleRequest,
  });

  log.info({
    action: "web.static_server.listen",
    outcome: "success",
    server: { port: server.port },
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    server.stop();
    await webServerDrain?.flush();
  };
  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
}
