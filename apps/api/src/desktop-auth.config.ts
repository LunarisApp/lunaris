import {
  markConflictingDesktopOrigin,
  isSerializedOrigin,
} from "./security/origin-protection";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "./app.config";
import { normalizeOrigin } from "./cors.config";

export const DESKTOP_COOKIE_HEADER = "x-tauri-cookie";
export const DESKTOP_ORIGIN_HEADER = "tauri-origin";

type DesktopAuthConfig = Pick<AppConfig, "desktopAppOrigins" | "nodeEnv">;

function isLocalDevelopmentOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

export function isAllowedDesktopCookieOrigin(
  origin: string | undefined,
  config: DesktopAuthConfig,
) {
  if (!origin || !isSerializedOrigin(origin)) return false;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (
    config.desktopAppOrigins.some(
      (allowed) => normalizeOrigin(allowed) === normalized,
    )
  ) {
    return true;
  }
  return config.nodeEnv !== "production" && isLocalDevelopmentOrigin(origin);
}

function bridgeDesktopCookie(
  request: FastifyRequest,
  config: DesktopAuthConfig,
) {
  const cookie = request.headers[DESKTOP_COOKIE_HEADER];
  const webOrigin = request.headers.origin;
  const tauriOrigin = request.headers[DESKTOP_ORIGIN_HEADER];
  const desktopOrigin =
    typeof tauriOrigin === "string" ? tauriOrigin : undefined;

  delete request.headers[DESKTOP_COOKIE_HEADER];
  delete request.headers[DESKTOP_ORIGIN_HEADER];

  if (
    tauriOrigin !== undefined &&
    (typeof tauriOrigin !== "string" || !isSerializedOrigin(tauriOrigin))
  ) {
    markConflictingDesktopOrigin(request);
    return;
  }

  if (
    webOrigin &&
    desktopOrigin &&
    normalizeOrigin(webOrigin) !== normalizeOrigin(desktopOrigin)
  ) {
    markConflictingDesktopOrigin(request);
    return;
  }

  const origin = webOrigin ?? desktopOrigin;
  if (!isAllowedDesktopCookieOrigin(origin, config)) return;

  if (!webOrigin && origin) request.headers.origin = origin;
  if (typeof cookie === "string") request.headers.cookie = cookie;
}

export function registerDesktopCookieBridge(
  app: FastifyInstance,
  config: DesktopAuthConfig,
) {
  app.addHook("onRequest", (request, _reply, done) => {
    bridgeDesktopCookie(request, config);
    done();
  });
}
