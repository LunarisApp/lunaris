import { AppConfig } from "./app.config";

export const CORS_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;

type CorsAppConfig = Pick<
  AppConfig,
  "desktopAppOrigins" | "frontendUrl" | "nodeEnv"
>;

export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== "null") return url.origin;
    if (!url.protocol || url.protocol === "file:") return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(
  origin: string | undefined,
  appConfig: CorsAppConfig
) {
  if (!origin) return true;
  const requestOrigin = normalizeOrigin(origin);
  if (!requestOrigin) return false;
  const allowedFrontend = normalizeOrigin(appConfig.frontendUrl);
  if (allowedFrontend && requestOrigin === allowedFrontend) return true;
  if (
    appConfig.desktopAppOrigins.some(
      (origin) => normalizeOrigin(origin) === requestOrigin,
    )
  ) {
    return true;
  }
  if (appConfig.nodeEnv === "production") return false;

  try {
    const url = new URL(requestOrigin);
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

export function getCorsConfig(appConfig: CorsAppConfig) {
  return {
    credentials: true,
    methods: [...CORS_METHODS],
    origin(
      origin: string | undefined,
      callback: (err: Error | null, allow: boolean) => void
    ) {
      callback(null, isAllowedOrigin(origin, appConfig));
    },
  };
}
