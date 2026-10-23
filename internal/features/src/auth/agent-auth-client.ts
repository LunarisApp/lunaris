import type { AuthClient } from "@repo/auth/client";

export async function agentAuthFetch<T>(
  auth: AuthClient,
  path: string,
  body?: unknown
): Promise<T> {
  const result = await auth.$fetch<T>(
    path,
    body === undefined ? {} : { method: "POST", body }
  );
  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Authorization failed");
  }
  return result.data;
}
