import { agentScopeSchema } from "@repo/agent-contracts";
import { APIError } from "better-auth/api";
import { z } from "zod";

const SECONDS_PER_DAY = 24 * 60 * 60;

export const agentApiKeyMetadataSchema = z.object({
  scopes: z.array(agentScopeSchema).min(1),
  organizationIds: z.array(z.string().min(1)).min(1),
});

function agentApiKeyPermissions(
  _referenceId: string,
  context: { body?: { metadata?: unknown } },
) {
  const metadata = agentApiKeyMetadataSchema.safeParse(context.body?.metadata);
  if (!metadata.success) {
    throw new APIError("BAD_REQUEST", {
      message: "Agent API keys require scopes and an organization allowlist",
    });
  }
  return { agent: metadata.data.scopes };
}

export function buildAgentApiKeyOptions() {
  return {
    apiKeyHeaders: "x-lunaris-api-key",
    defaultPrefix: "lun_",
    enableMetadata: true,
    // Agent keys are verified by the scoped control-plane guard. Turning them
    // into Better Auth sessions would grant access to every session endpoint.
    enableSessionForAPIKeys: false,
    keyExpiration: {
      defaultExpiresIn: 90 * SECONDS_PER_DAY,
      maxExpiresIn: 365,
      minExpiresIn: 1,
    },
    permissions: {
      defaultPermissions: agentApiKeyPermissions,
    },
    rateLimit: { enabled: true, maxRequests: 300, timeWindow: 60_000 },
    references: "user" as const,
  };
}
