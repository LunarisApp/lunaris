import { type AgentScope, agentScopeSchema } from "@repo/agent-contracts";

export function firstHeader(
  value: string | string[] | null | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

export function bearerToken(value: string | null | undefined) {
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : undefined;
}

export function parseAgentScopes(value: unknown): AgentScope[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(" ")
      : [];
  return values.flatMap((candidate) => {
    const parsed = agentScopeSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

export function oauthClientId(claims: unknown) {
  if (typeof claims !== "object" || claims === null) {
    return;
  }
  const { azp, client_id: clientId } = claims as Record<string, unknown>;
  if (typeof clientId === "string") {
    return clientId;
  }
  return typeof azp === "string" ? azp : undefined;
}
