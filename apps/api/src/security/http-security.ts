import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { AppConfig } from "../app.config";
import { getCorsConfig } from "../cors.config";
import { registerDesktopCookieBridge } from "../desktop-auth.config";
import {
  getSecurityHeadersConfig,
  registerPermissionsPolicyHeader,
} from "../helmet.config";
import {
  getCsrfProtectionOptions,
  registerOriginValidation,
} from "./origin-protection";

export function configureHttpSecurity(
  app: NestFastifyApplication,
  config: AppConfig
) {
  const fastify = app.getHttpAdapter().getInstance();
  app.enableCors(getCorsConfig(config));
  registerDesktopCookieBridge(fastify, config);
  registerPermissionsPolicyHeader(fastify);
  app.useSecurityHeaders(
    getSecurityHeadersConfig(config.nodeEnv === "production")
  );
  app.enableCsrfProtection(getCsrfProtectionOptions(config));
  registerOriginValidation(fastify);
}
