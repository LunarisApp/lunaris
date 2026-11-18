import { POSTHOG_MCP_CLIENT } from "@app/posthog";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import {
  All,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Req,
  Res,
  SetMetadata,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { agentScopeSchema } from "@repo/agent-contracts";
import { type Auth, resolveAgentAuthorization } from "@repo/auth/server";
import { AuthService } from "@thallesp/nestjs-better-auth";
import { useLogger } from "evlog/nestjs";
import type { NodeResponse, NodeRequest } from "@nestjs/platform-node";
import type { PostHog } from "posthog-node";
import {
  bearerToken,
  firstHeader,
  oauthClientId,
  parseAgentScopes,
} from "../control/access/agent-auth.utils";
import { BackendControlClientFactory } from "../control/backend/backend-control.client";
import { AppConfig } from "../../app.config";
import { createAgentToolsServer } from "./agent-tools.server";
import { instrumentMcpServer } from "./mcp.analytics";

type OAuthAuth = Auth & {
  api: Auth["api"] & {
    getOAuthServerConfig(...args: unknown[]): unknown;
  };
};

@Controller({ path: "", version: VERSION_NEUTRAL })
@SetMetadata("PUBLIC", true)
export class McpController {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly auth: AuthService<OAuthAuth>,
    private readonly clients: BackendControlClientFactory,
    @Inject(POSTHOG_MCP_CLIENT) private readonly mcpPosthog: PostHog | null
  ) {}

  @All("mcp")
  async handleMcp(@Req() request: NodeRequest, @Res() reply: NodeResponse) {
    if (
      !isMcpOriginAllowed(
        firstHeader(request.headers.origin),
        this.appConfig.url,
        this.appConfig.frontendUrl
      )
    ) {
      return reply.status(HttpStatus.FORBIDDEN).send({
        code: "INVALID_ORIGIN",
        message: "Origin is not allowed for the MCP endpoint",
      });
    }
    const webRequest = await toWebRequest(request, this.appConfig.url);
    const token = bearerToken(webRequest.headers.get("authorization"));
    if (!token) {
      return unauthorized(reply, this.resourceUrl);
    }

    try {
      const jwt = await oauthProviderResourceClient(this.auth.instance)
        .getActions()
        .verifyBearerToken(token, {
          verifyOptions: { audience: this.resourceUrl },
        });
      const actorId = typeof jwt.sub === "string" ? jwt.sub : undefined;
      const clientId = oauthClientId(jwt);
      if (!(actorId && clientId)) {
        return unauthorized(reply, this.resourceUrl);
      }
      const policy = await resolveAgentAuthorization(
        (await this.auth.instance.$context).adapter,
        actorId,
        clientId,
        this.resourceUrl,
        parseAgentScopes(jwt.scope ?? jwt.scopes),
        jwt.lunaris_grants
      );
      const scopes = parseAgentScopes(policy.scopes);
      useLogger().set({
        agent: { clientId, kind: "oauth", scopeCount: scopes.length },
        user: { id: actorId },
      });
      const client = this.clients.create({
        actorId,
        clientId,
        kind: "oauth",
        scopes,
        organizationIds: policy.organizationIds,
      });
      const server = createAgentToolsServer(client, { name: "lunaris-hosted" });
      instrumentMcpServer(server, this.mcpPosthog, actorId);
      const transport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse: true,
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      const response = await transport.handleRequest(webRequest, {
        authInfo: { clientId, scopes, token },
      });
      return sendWebResponse(reply, response);
    } catch {
      return unauthorized(reply, this.resourceUrl);
    }
  }

  @Get(".well-known/oauth-protected-resource/mcp")
  async protectedResource(@Res() reply: NodeResponse) {
    const metadata = await oauthProviderResourceClient(this.auth.instance)
      .getActions()
      .getProtectedResourceMetadata({
        resource: this.resourceUrl,
        scopes_supported: [...agentScopeSchema.options],
      });
    return reply.send(metadata);
  }

  @Get([
    ".well-known/oauth-authorization-server",
    ".well-known/oauth-authorization-server/auth",
  ])
  async authorizationServer(
    @Req() request: NodeRequest,
    @Res() reply: NodeResponse
  ) {
    const handler = oauthProviderAuthServerMetadata(this.auth.instance);
    const response = await handler(
      await toWebRequest(request, this.appConfig.url)
    );
    return sendWebResponse(reply, response);
  }

  private get resourceUrl() {
    return `${this.appConfig.url.replace(/\/$/, "")}/mcp`;
  }
}

export function isMcpOriginAllowed(
  origin: string | undefined,
  backendUrl: string,
  frontendUrl: string
) {
  if (!origin) {
    return true;
  }
  try {
    const normalized = new URL(origin).origin;
    return [backendUrl, frontendUrl].some(
      (allowed) => new URL(allowed).origin === normalized
    );
  } catch {
    return false;
  }
}

export async function toWebRequest(
  request: NodeRequest,
  fallbackOrigin: string
) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (value !== undefined) {
      headers.set(key, String(value));
    }
  }
  const method = (request.method ?? "GET").toUpperCase();
  const body = ["GET", "HEAD"].includes(method)
    ? undefined
    : serializeRequestBody(request.body);
  headers.delete("content-length");
  const origin = fallbackOrigin.replace(/\/$/, "");
  return new Request(
    new URL(request.originalUrl ?? request.url ?? "/", origin),
    { body, headers, method }
  );
}

function serializeRequestBody(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf8");
  }
  return JSON.stringify(body);
}

async function sendWebResponse(reply: NodeResponse, response: Response) {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    reply.set(key, value);
  });
  return reply.send(Buffer.from(await response.arrayBuffer()));
}

function unauthorized(reply: NodeResponse, resource: string) {
  return reply
    .status(HttpStatus.UNAUTHORIZED)
    .set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${resource.replace(/\/mcp$/, "/.well-known/oauth-protected-resource/mcp")}"`
    )
    .send({
      code: "UNAUTHORIZED",
      message: "A valid MCP access token is required",
    });
}
