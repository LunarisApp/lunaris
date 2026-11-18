import { ForbiddenException, type CsrfProtectionOptions } from "@nestjs/common";
import type { NestNodeApplication, NodeRequest } from "@nestjs/platform-node";
import type { AppConfig } from "../app.config";

export class OriginRejectedException extends ForbiddenException {
  constructor() {
    super("Invalid request origin");
  }
}

type OriginConfig = Pick<
  AppConfig,
  "url" | "frontendUrl" | "desktopAppOrigins" | "nodeEnv"
>;
const conflictingDesktopOrigins = new WeakSet<NodeRequest>();
export function markConflictingDesktopOrigin(request: NodeRequest) {
  conflictingDesktopOrigins.add(request);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSerializedOrigin(origin: string): boolean {
  if (origin === "lunaris://") {
    return true;
  }
  if (/\s/.test(origin)) {
    return false;
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\/[^/?#\\]+$/i.test(origin)) {
    return false;
  }
  try {
    const url = new URL(origin);
    return (
      Boolean(url.host) &&
      !url.username &&
      !url.password &&
      !url.host.includes("*")
    );
  } catch {
    return false;
  }
}

export function registerOriginValidation(app: NestNodeApplication) {
  app.use(
    (request: NodeRequest, _reply: unknown, done: (error?: Error) => void) => {
      const origin = request.headers.origin;
      if (
        !SAFE_METHODS.has(request.method ?? "GET") &&
        (conflictingDesktopOrigins.has(request) ||
          (origin !== undefined &&
            (typeof origin !== "string" || !isSerializedOrigin(origin))))
      ) {
        done(new OriginRejectedException());
        return;
      }
      done();
    }
  );
}

export function getCsrfProtectionOptions(
  config: OriginConfig
): CsrfProtectionOptions {
  const origins = [
    new URL(config.url).origin,
    new URL(config.frontendUrl).origin,
    ...config.desktopAppOrigins,
  ];
  for (const origin of origins) {
    if (!isSerializedOrigin(origin)) {
      throw new Error("Invalid configured CSRF origin");
    }
  }
  return {
    trustedOrigins: [
      ...new Set(origins.filter((origin) => origin !== "lunaris://")),
    ],
    exclude: (request: NodeRequest) => {
      const origin = request.headers.origin;
      if (origin === "lunaris://") {
        return config.desktopAppOrigins.includes(origin);
      }
      if (
        config.nodeEnv === "production" ||
        typeof origin !== "string" ||
        !isSerializedOrigin(origin)
      ) {
        return false;
      }
      const url = new URL(origin);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      );
    },
  };
}
