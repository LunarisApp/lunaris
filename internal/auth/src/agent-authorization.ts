import { createHash, randomUUID } from "node:crypto";
import {
  extendOAuthProvider,
  getOAuthProviderState,
} from "@better-auth/oauth-provider";
import type { AuthContext, BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
} from "better-auth/api";
import { z } from "zod";

type Adapter = Pick<
  AuthContext["adapter"],
  "findOne" | "findMany" | "create" | "update" | "deleteMany"
>;
export interface AgentGrant {
  clientId: string;
  createdAt: Date;
  id: string;
  organizationIds: string[];
  requestHash: string;
  resource: string;
  revokedAt?: Date | null;
  scopes: string[];
  updatedAt: Date;
  userId: string;
  version: string;
}
interface DeviceRequest {
  expiresAt: Date;
  id: string;
  oauthClientId?: string;
  resources?: string[];
  scope?: string;
  status: string;
  userCode: string;
  userId?: string;
}
const requestSchema = z.object({
  oauth_query: z.string().max(16_384).optional(),
  userCode: z.string().min(1).max(191).optional(),
});
const approveSchema = requestSchema.extend({
  organizationIds: z.array(z.string().min(1)).min(1).max(100),
});
function denied(
  message = "Agent authorization required. Reconnect and choose organizations."
): never {
  throw new APIError("FORBIDDEN", {
    code: "AGENT_AUTHORIZATION_REQUIRED",
    message,
  });
}
function grantWhere(userId: string, clientId: string, resource: string) {
  return [
    { field: "userId", value: userId },
    { field: "clientId", value: clientId },
    { field: "resource", value: resource },
  ];
}
export function effectiveAgentGrant(
  grant: AgentGrant | null,
  tokenScopes: readonly string[]
) {
  if (!grant || grant.revokedAt || !grant.organizationIds.length) {
    return null;
  }
  return {
    organizationIds: grant.organizationIds,
    scopes: tokenScopes.filter((scope) => grant.scopes.includes(scope)),
  };
}
export async function resolveAgentAuthorization(
  adapter: Adapter,
  userId: string,
  clientId: string,
  resource: string,
  scopes: readonly string[],
  versions: unknown
) {
  const grant = await adapter.findOne<AgentGrant>({
    model: "agentAuthorization",
    where: grantWhere(userId, clientId, resource),
  });
  const effective = effectiveAgentGrant(grant, scopes);
  if (
    !(effective && versions) ||
    typeof versions !== "object" ||
    (versions as Record<string, unknown>)[resource] !== grant?.version
  ) {
    denied();
  }
  return effective;
}

export function agentAuthorization(resources: string[]) {
  return {
    id: "lunaris-agent-authorization",
    init(ctx) {
      extendOAuthProvider(ctx, {
        claims: {
          accessToken: async ({
            ctx: request,
            user,
            client,
            resources: audiences,
          }) => {
            if (!(user && audiences?.length)) {
              denied();
            }
            const versions: Record<string, string> = {};
            for (const resource of audiences) {
              const grant = await request.context.adapter.findOne<AgentGrant>({
                model: "agentAuthorization",
                where: grantWhere(user.id, client.clientId, resource),
              });
              if (!grant || grant.revokedAt) {
                denied();
              }
              versions[resource] = grant.version;
            }
            return { lunaris_grants: versions };
          },
        },
      });
    },
    schema: {
      agentAuthorization: {
        fields: {
          userId: {
            type: "string",
            required: true,
            references: { model: "user", field: "id", onDelete: "cascade" },
          },
          clientId: { type: "string", required: true },
          resource: { type: "string", required: true },
          scopes: { type: "string[]", required: true },
          organizationIds: { type: "string[]", required: true },
          requestHash: { type: "string", required: true },
          version: { type: "string", required: true },
          createdAt: { type: "date", required: true },
          updatedAt: { type: "date", required: true },
          revokedAt: { type: "date", required: false },
        },
      },
    },
    endpoints: {
      agentAuthorizationDetails: createAuthEndpoint(
        "/agent/authorization",
        { method: "POST", body: requestSchema },
        async (ctx) => {
          const session = await getAuthoritativeSessionFromCtx(ctx);
          if (
            !session ||
            session.user.isAnonymous ||
            !session.user.emailVerified
          ) {
            denied("Sign in to authorize an agent.");
          }
          const details = await describe(
            ctx.context.adapter,
            session.user.id,
            ctx.body
          );
          const memberships = await ctx.context.adapter.findMany<{
            organizationId: string;
          }>({
            model: "member",
            where: [{ field: "userId", value: session.user.id }],
            limit: 100,
          });
          const organizations = await Promise.all(
            memberships.map(async ({ organizationId }) =>
              ctx.context.adapter.findOne<{ id: string; name: string }>({
                model: "organization",
                where: [{ field: "id", value: organizationId }],
              })
            )
          );
          ctx.setHeader("Cache-Control", "no-store");
          return ctx.json({
            ...details,
            organizations: organizations
              .filter((org) => org !== null)
              .map(({ id, name }) => ({ id, name })),
          });
        }
      ),
      approveAgentAuthorization: createAuthEndpoint(
        "/agent/authorize",
        { method: "POST", body: approveSchema },
        async (ctx) => {
          const session = await getAuthoritativeSessionFromCtx(ctx);
          if (
            !session ||
            session.user.isAnonymous ||
            !session.user.emailVerified
          ) {
            denied("Sign in to authorize an agent.");
          }
          const details = await describe(
            ctx.context.adapter,
            session.user.id,
            ctx.body
          );
          const organizationIds = [...new Set(ctx.body.organizationIds)];
          for (const organizationId of organizationIds) {
            const membership = await ctx.context.adapter.findOne({
              model: "member",
              where: [
                { field: "userId", value: session.user.id },
                { field: "organizationId", value: organizationId },
              ],
            });
            if (!membership) {
              denied("Organization membership required.");
            }
          }
          await ctx.context.adapter.deleteMany({
            model: "oauthRefreshToken",
            where: [
              { field: "userId", value: session.user.id },
              { field: "clientId", value: details.clientId },
            ],
          });
          for (const resource of details.resources) {
            const previous = await ctx.context.adapter.findOne<AgentGrant>({
              model: "agentAuthorization",
              where: grantWhere(session.user.id, details.clientId, resource),
            });
            const data = {
              userId: session.user.id,
              clientId: details.clientId,
              resource,
              scopes: details.scopes,
              organizationIds,
              requestHash: details.requestHash,
              version: randomUUID(),
              updatedAt: new Date(),
              revokedAt: null,
            };
            if (previous) {
              await ctx.context.adapter.update({
                model: "agentAuthorization",
                where: [{ field: "id", value: previous.id }],
                update: data,
              });
            } else {
              await ctx.context.adapter.create({
                model: "agentAuthorization",
                data: { ...data, id: randomUUID(), createdAt: new Date() },
                forceAllowId: true,
              });
            }
          }
          ctx.setHeader("Cache-Control", "no-store");
          return ctx.json({ success: true });
        }
      ),
      listAgentAuthorizations: createAuthEndpoint(
        "/agent/grants",
        { method: "GET" },
        async (ctx) => {
          const session = await getAuthoritativeSessionFromCtx(ctx);
          if (!session) {
            denied();
          }
          const grants = await ctx.context.adapter.findMany<AgentGrant>({
            model: "agentAuthorization",
            where: [{ field: "userId", value: session.user.id }],
            limit: 100,
          });
          ctx.setHeader("Cache-Control", "no-store");
          return ctx.json({
            grants: await Promise.all(
              grants
                .filter((grant) => !grant.revokedAt)
                .map(async (grant) => {
                  const client = await ctx.context.adapter.findOne<{
                    name?: string;
                  }>({
                    model: "oauthClient",
                    where: [{ field: "clientId", value: grant.clientId }],
                  });
                  return {
                    id: grant.id,
                    clientId: grant.clientId,
                    resource: grant.resource,
                    scopes: grant.scopes,
                    organizationIds: grant.organizationIds,
                    createdAt: grant.createdAt,
                    updatedAt: grant.updatedAt,
                    clientName: client?.name ?? grant.clientId,
                  };
                })
            ),
          });
        }
      ),
      revokeAgentAuthorization: createAuthEndpoint(
        "/agent/revoke",
        { method: "POST", body: z.object({ id: z.string() }) },
        async (ctx) => {
          const session = await getAuthoritativeSessionFromCtx(ctx);
          if (!session) {
            denied();
          }
          const grant = await ctx.context.adapter.findOne<AgentGrant>({
            model: "agentAuthorization",
            where: [
              { field: "id", value: ctx.body.id },
              { field: "userId", value: session.user.id },
            ],
          });
          if (!grant) {
            denied();
          }
          // Mark policy first: already-issued JWTs fail immediately even if token cleanup fails.
          await ctx.context.adapter.update({
            model: "agentAuthorization",
            where: [{ field: "id", value: grant.id }],
            update: { revokedAt: new Date(), updatedAt: new Date() },
          });
          const where = [
            { field: "userId", value: session.user.id },
            { field: "clientId", value: grant.clientId },
          ];
          await ctx.context.adapter.deleteMany({
            model: "oauthRefreshToken",
            where,
          });
          await ctx.context.adapter.deleteMany({
            model: "oauthConsent",
            where,
          });
          return ctx.json({ success: true });
        }
      ),
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/oauth2/authorize",
          handler: createAuthMiddleware(async (ctx) => {
            // Explicit browser connections always review the current organization boundary.
            // Preserve prompt=none so the provider returns its standard interaction error.
            const prompts = new Set(
              String(ctx.query?.prompt ?? "")
                .split(/\s+/)
                .filter(Boolean)
            );
            if (!prompts.has("none")) {
              prompts.add("consent");
              ctx.query = { ...ctx.query, prompt: [...prompts].join(" ") };
            }
          }),
        },
        {
          matcher: (ctx) => ctx.path === "/oauth2/register",
          handler: createAuthMiddleware(async (ctx) => {
            const redirects: unknown = ctx.body?.redirect_uris;
            if (
              ctx.body?.application_type ||
              !Array.isArray(redirects) ||
              !redirects.length
            ) {
              return;
            }
            const native = redirects.every((redirect) => {
              if (typeof redirect !== "string") {
                return false;
              }
              try {
                const url = new URL(redirect);
                return (
                  !["http:", "https:"].includes(url.protocol) ||
                  (url.protocol === "http:" &&
                    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
                );
              } catch {
                return false;
              }
            });
            if (native) {
              ctx.body.application_type = "native";
            }
          }),
        },
        {
          matcher: (ctx) =>
            (ctx.path === "/oauth2/consent" && ctx.body?.accept === true) ||
            ctx.path === "/device/approve",
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getAuthoritativeSessionFromCtx(ctx);
            if (!session) {
              denied();
            }
            const request =
              ctx.path === "/device/approve"
                ? { userCode: ctx.body.userCode as string }
                : { oauth_query: ctx.body.oauth_query as string };
            const details = await describe(
              ctx.context.adapter,
              session.user.id,
              request
            );
            for (const resource of details.resources) {
              const grant = await ctx.context.adapter.findOne<AgentGrant>({
                model: "agentAuthorization",
                where: grantWhere(session.user.id, details.clientId, resource),
              });
              if (
                !grant ||
                grant.revokedAt ||
                grant.requestHash !== details.requestHash
              ) {
                denied("Choose organizations before approving this request.");
              }
            }
          }),
        },
      ],
    },
    rateLimit: [
      {
        pathMatcher: (path) =>
          path.startsWith("/agent/") ||
          path.startsWith("/device") ||
          path === "/oauth2/register",
        window: 60,
        max: 30,
      },
    ],
  } satisfies BetterAuthPlugin;

  async function describe(
    adapter: Adapter,
    userId: string,
    input: z.infer<typeof requestSchema>
  ) {
    if (Boolean(input.oauth_query) === Boolean(input.userCode)) {
      denied("Provide one authorization request.");
    }
    let clientId: string;
    let scopes: string[];
    let requestedResources: string[];
    let requestKey: string;
    if (input.userCode) {
      const userCode = input.userCode
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase();
      const record = await adapter.findOne<DeviceRequest>({
        model: "deviceCode",
        where: [{ field: "userCode", value: userCode }],
      });
      if (
        !record?.oauthClientId ||
        record.userId !== userId ||
        record.status !== "pending" ||
        new Date(record.expiresAt).getTime() <= Date.now()
      ) {
        denied(
          "Device request invalid, expired, already used, or belongs to another account. Start login again."
        );
      }
      clientId = record.oauthClientId;
      scopes = (record.scope ?? "").split(/\s+/).filter(Boolean);
      requestedResources = record.resources ?? [];
      requestKey = record.id;
    } else {
      // OAuth Provider verifies oauth_query before this plugin's endpoints/hooks run.
      const state = await getOAuthProviderState();
      if (!state?.query) {
        denied("Invalid or expired authorization request.");
      }
      const query = new URLSearchParams(state.query);
      clientId = query.get("client_id") ?? "";
      scopes = (query.get("scope") ?? "").split(/\s+/).filter(Boolean);
      requestedResources = query.getAll("resource");
      requestKey = state.query;
    }
    if (
      !requestedResources.length ||
      requestedResources.some((resource) => !resources.includes(resource))
    ) {
      denied(
        "Unsupported API audience. Restart authorization with a resource parameter."
      );
    }
    const client = await adapter.findOne<{
      name?: string;
      disabled?: boolean;
      scopes?: string[];
    }>({
      model: "oauthClient",
      where: [{ field: "clientId", value: clientId }],
    });
    if (
      !client ||
      client.disabled ||
      scopes.some((scope) => !client.scopes?.includes(scope))
    ) {
      denied("Invalid client or scopes.");
    }
    return {
      clientId,
      clientName: client.name ?? clientId,
      scopes,
      resources: requestedResources,
      requestHash: createHash("sha256").update(requestKey).digest("hex"),
    };
  }
}
