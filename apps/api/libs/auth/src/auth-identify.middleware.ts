import type { IncomingMessage, ServerResponse } from "node:http";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { Auth } from "@repo/auth/server";
import { AuthService } from "@thallesp/nestjs-better-auth";
import { createAuthMiddleware } from "evlog/better-auth";
import { useLogger } from "evlog/nestjs";

@Injectable()
export class AuthIdentifyMiddleware implements NestMiddleware {
  private readonly identify: ReturnType<typeof createAuthMiddleware>;

  constructor(authService: AuthService<Auth>) {
    this.identify = createAuthMiddleware(authService.instance, {
      exclude: [
        "/api/auth/**",
        "/api",
        "/api/**",
        "/api-json",
        "/api-yaml",
        "/v1/health",
        "/v1/manifest",
      ],
      extend: ({ session }) => {
        const organizationId = session.activeOrganizationId;
        return typeof organizationId === "string"
          ? { organization: { id: organizationId } }
          : undefined;
      },
      fields: ["id"],
      session: false,
    });
  }

  async use(
    request: IncomingMessage,
    _response: ServerResponse,
    next: () => void
  ): Promise<void> {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    await this.identify(useLogger(), request.headers, path);
    next();
  }
}
