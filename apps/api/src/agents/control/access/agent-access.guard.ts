import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type AgentScope, agentScopeSchema } from "@repo/agent-contracts";
import type { AppPermission } from "@repo/auth/permissions";
import { type Auth, agentApiKeyMetadataSchema } from "@repo/auth/server";
import {
  AuthService,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { useLogger } from "evlog/nestjs";
import type { FastifyRequest } from "fastify";
import { AppConfig } from "../../../app.config";
import { routeAuditAction } from "../../../audit/recording/audit.actions";
import { recordComplianceAudit } from "../../../audit/recording/audit-log";
import { auditInputForRequest } from "../../../audit/recording/audit-request";
import { PERMISSION_METADATA } from "../../../security/permissions/permission.decorator";
import { PermissionService } from "../../../security/permissions/permission.service";
import {
  bearerToken,
  firstHeader,
  oauthClientId,
  parseAgentScopes,
} from "./agent-auth.utils";
import { AgentControlService } from "../agent-control.service";
import {
  AGENT_SCOPE_METADATA,
  type AgentPrincipal,
} from "./agent-principal";

type ApiKeyVerification = {
  error: null | { code: string; message?: string };
  key: null | {
    id: string;
    metadata?: unknown;
    permissions?: Record<string, string[]> | null;
    referenceId: string;
  };
  valid: boolean;
};

type AgentAuth = Auth & {
  api: Auth["api"] & {
    verifyApiKey(input: {
      body: { key: string; permissions?: { agent: string[] } };
    }): Promise<ApiKeyVerification>;
  };
};

export type AgentRequest = FastifyRequest & {
  agentPrincipal?: AgentPrincipal;
  auditActor?: { id: string; type: "api" | "user" };
  session?: UserSession;
  user?: UserSession["user"];
};

@Injectable()
export class AgentAccessGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService<AgentAuth>,
    private readonly appConfig: AppConfig,
    private readonly control: AgentControlService,
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const authorized = await this.authorize(context);
      if (authorized) await this.requirePermission(context);
      return authorized;
    } catch (error) {
      const status =
        error instanceof HttpException ? error.getStatus() : undefined;
      if (status === 401 || status === 403) {
        const action = routeAuditAction(
          context.getClass().name,
          context.getHandler().name,
        );
        if (action) {
          recordComplianceAudit(
            useLogger(),
            auditInputForRequest(context, action, "denied"),
            error instanceof Error
              ? error.message
              : "Agent access denied",
          );
        }
      }
      throw error;
    }
  }

  private async requirePermission(context: ExecutionContext): Promise<void> {
    const required = this.reflector.getAllAndOverride<
      AppPermission | undefined
    >(
      PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return;

    const request = context.switchToHttp().getRequest<AgentRequest>();
    await this.permissions.requirePermission(required, {
      organizationId: request.session?.session.activeOrganizationId,
      userId: request.session?.user.id,
    });
  }

  private async authorize(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<AgentScope>(
      AGENT_SCOPE_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!scope) throw new ForbiddenException("Agent scope is not configured");

    const request = context.switchToHttp().getRequest<AgentRequest>();
    const apiKey = firstHeader(request.headers["x-lunaris-api-key"]);
    const accessToken = bearerToken(firstHeader(request.headers.authorization));
    if (accessToken) {
      const jwt = await this.verifyOAuthToken(accessToken, scope);
      const actorId = typeof jwt.sub === "string" ? jwt.sub : undefined;
      const clientId = oauthClientId(jwt);
      if (!actorId || !clientId) throw new UnauthorizedException();
      request.auditActor = { id: actorId, type: "api" };
      await this.control.assertAgentEligible(actorId);
      const scopes = parseAgentScopes(jwt.scope ?? jwt.scopes);
      request.agentPrincipal = {
        actorId,
        clientId,
        kind: "oauth",
        scopes,
        organizationIds: null,
      };
      request.session = agentSession(
        actorId,
        request.params as { organizationId?: string },
        "oauth",
      );
      request.user = request.session.user;
      return true;
    }
    if (!apiKey) {
      if (!request.user?.id) throw new UnauthorizedException();
      await this.control.assertAgentEligible(request.user.id);
      request.agentPrincipal = {
        actorId: request.user.id,
        kind: "session",
        scopes: [...agentScopeSchema.options],
        organizationIds: null,
      };
      return true;
    }

    const verified = await this.auth.instance.api.verifyApiKey({
      body: { key: apiKey },
    });
    if (!verified.valid || !verified.key) {
      throw new UnauthorizedException(
        verified.error?.message ?? "Invalid API key",
      );
    }
    request.auditActor = {
      id: verified.key.referenceId,
      type: "api",
    };
    if (!verified.key.permissions?.agent?.includes(scope)) {
      throw new ForbiddenException("API key lacks required scope");
    }
    const metadata = agentApiKeyMetadataSchema.safeParse(verified.key.metadata);
    if (!metadata.success) {
      throw new ForbiddenException("API key has no organization allowlist");
    }
    const organizationId = (request.params as { organizationId?: string })
      .organizationId;
    if (
      organizationId &&
      !metadata.data.organizationIds.includes(organizationId)
    ) {
      throw new ForbiddenException("API key is not allowed in this organization");
    }
    await this.control.assertAgentEligible(verified.key.referenceId);

    request.agentPrincipal = {
      actorId: verified.key.referenceId,
      credentialId: verified.key.id,
      kind: "apiKey",
      scopes: (verified.key.permissions?.agent ?? []).filter((candidate) =>
        agentScopeSchema.safeParse(candidate).success,
      ) as AgentScope[],
      organizationIds: metadata.data.organizationIds,
    };
    request.session = agentSession(
      verified.key.referenceId,
      request.params as { organizationId?: string },
      "api-key",
    );
    request.user = request.session.user;
    return true;
  }

  private async verifyOAuthToken(accessToken: string, scope: AgentScope) {
    try {
      return await oauthProviderResourceClient(this.auth.instance)
        .getActions()
        .verifyBearerToken(accessToken, {
          requiredScopes: [scope],
          verifyOptions: { audience: this.appConfig.url.replace(/\/$/, "") },
        });
    } catch {
      throw new UnauthorizedException("Invalid OAuth access token");
    }
  }
}

function agentSession(
  actorId: string,
  params: { organizationId?: string },
  kind: "api-key" | "oauth",
): UserSession {
  const now = new Date();
  return {
    session: {
      activeOrganizationId: params.organizationId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      id: `${kind}:${actorId}`,
      ipAddress: null,
      token: `${kind}-resource-principal`,
      updatedAt: now,
      userAgent: null,
      userId: actorId,
    },
    user: {
      createdAt: now,
      email: `${kind}@invalid.local`,
      emailVerified: true,
      id: actorId,
      image: null,
      name: "Agent principal",
      updatedAt: now,
    },
  };
}
