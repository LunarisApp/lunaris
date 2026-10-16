"use client";

import type { AuthClient } from "@repo/auth/client";
import type { QueryClient } from "@tanstack/react-query";
import { log, parseError } from "evlog";

export interface AccountInfo {
  id: string;
  providerId: string;
}

export interface SessionInfo {
  createdAt: Date;
  id: string;
  ipAddress?: string | null;
  token: string;
  updatedAt: Date;
  userAgent?: string | null;
}

export interface PasskeyInfo {
  backedUp: boolean;
  createdAt?: Date | string | null;
  deviceType: "multiDevice" | "singleDevice";
  id: string;
  name?: string | null;
}

export const settingsQueryKeys = {
  securityAccounts: () => ["settings", "security", "accounts"] as const,
  securityPasskeys: () => ["settings", "security", "passkeys"] as const,
  securitySessions: () => ["settings", "security", "sessions"] as const,
};

class SecuritySessionsError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
    this.name = "SecuritySessionsError";
  }
}

export function isSessionNotFreshError(error: unknown): boolean {
  return (
    error instanceof SecuritySessionsError && error.code === "SESSION_NOT_FRESH"
  );
}

export function authSupportsPasskeys(auth: AuthClient): boolean {
  return auth.supportsPasskeys() === true;
}

export function securityAccountsQueryOptions(auth: AuthClient) {
  return {
    networkMode: "online" as const,
    queryKey: settingsQueryKeys.securityAccounts(),
    queryFn: async (): Promise<AccountInfo[]> => {
      try {
        const result = (await auth.$fetch("/list-accounts", {
          method: "GET",
        })) as {
          data?: AccountInfo[];
          error?: { message?: string };
        };

        if (result.error) {
          throw new Error(
            result.error.message ?? "Failed to load sign-in methods"
          );
        }

        return result.data ?? [];
      } catch (error) {
        log.error({
          tag: "Security",
          msg: "account list failed",
          error: parseError(error),
        });
        throw error;
      }
    },
  };
}

export function securitySessionsQueryOptions(auth: AuthClient) {
  return {
    networkMode: "online" as const,
    queryKey: settingsQueryKeys.securitySessions(),
    queryFn: async (): Promise<SessionInfo[]> => {
      try {
        const result = await auth.listSessions();
        if (result.error) {
          throw new SecuritySessionsError(
            result.error.message ?? "Failed to load sessions",
            "code" in result.error && typeof result.error.code === "string"
              ? result.error.code
              : undefined
          );
        }
        return (result.data ?? []) as SessionInfo[];
      } catch (error) {
        const requiresReauthentication = isSessionNotFreshError(error);
        const event = {
          tag: "Security",
          msg: requiresReauthentication
            ? "session reauthentication required"
            : "session list failed",
          error: parseError(error),
        };
        if (requiresReauthentication) {
          log.info(event);
        } else {
          log.error(event);
        }
        throw error;
      }
    },
  };
}

export function securityPasskeysQueryOptions(auth: AuthClient) {
  return {
    networkMode: "online" as const,
    queryKey: settingsQueryKeys.securityPasskeys(),
    queryFn: async (): Promise<PasskeyInfo[]> => {
      try {
        const result = await auth.passkey.listUserPasskeys();
        if (result.error) {
          throw new Error(result.error.message ?? "Failed to load passkeys");
        }
        return (result.data ?? []) as PasskeyInfo[];
      } catch (error) {
        log.error({
          tag: "Security",
          msg: "passkey list failed",
          error: parseError(error),
        });
        throw error;
      }
    },
  };
}

export async function preloadSettingsData({
  auth,
  isAnonymous,
  queryClient,
}: {
  auth: AuthClient;
  isAnonymous: boolean;
  queryClient: QueryClient;
}) {
  if (isAnonymous) {
    return;
  }

  const tasks = [
    queryClient.prefetchQuery(securityAccountsQueryOptions(auth)),
    queryClient.prefetchQuery(securitySessionsQueryOptions(auth)),
  ];

  if (authSupportsPasskeys(auth)) {
    tasks.push(queryClient.prefetchQuery(securityPasskeysQueryOptions(auth)));
  }

  await Promise.allSettled(tasks);
}
