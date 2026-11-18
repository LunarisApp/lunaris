import type { NestNodeApplication } from "@nestjs/platform-node";
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
  app: NestNodeApplication,
  config: AppConfig
) {
  registerDesktopCookieBridge(app, config);
  registerPermissionsPolicyHeader(app);
  app.enableCors(getCorsConfig(config));
  app.useSecurityHeaders(
    getSecurityHeadersConfig(config.nodeEnv === "production")
  );
  app.enableCsrfProtection(getCsrfProtectionOptions(config));
  registerOriginValidation(app);
}
