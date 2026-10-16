import type { AuthClient } from "@repo/auth/client";
import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  isSessionNotFreshError,
  preloadSettingsData,
  securityAccountsQueryOptions,
  securityPasskeysQueryOptions,
  securitySessionsQueryOptions,
  settingsQueryKeys,
} from "./queries";

function createPreloadDependencies() {
  const prefetchQuery = vi.fn().mockResolvedValue(undefined);
  return {
    auth: {
      supportsPasskeys: () => false,
    } as unknown as AuthClient,
    prefetchQuery,
    queryClient: { prefetchQuery } as unknown as QueryClient,
  };
}

describe("preloadSettingsData", () => {
  it("preloads security data", async () => {
    const { auth, prefetchQuery, queryClient } = createPreloadDependencies();

    await preloadSettingsData({
      auth,
      isAnonymous: false,
      queryClient,
    });

    expect(
      prefetchQuery.mock.calls.map(([options]) => options.queryKey)
    ).toEqual([
      settingsQueryKeys.securityAccounts(),
      settingsQueryKeys.securitySessions(),
    ]);
  });

  it("keeps security reads network-only", () => {
    const { auth } = createPreloadDependencies();

    expect(securityAccountsQueryOptions(auth).networkMode).toBe("online");
    expect(securitySessionsQueryOptions(auth).networkMode).toBe("online");
    expect(securityPasskeysQueryOptions(auth).networkMode).toBe("online");
  });

  it("surfaces Better Auth session errors", async () => {
    const { auth } = createPreloadDependencies();
    auth.listSessions = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Session service unavailable" },
    });

    await expect(securitySessionsQueryOptions(auth).queryFn()).rejects.toThrow(
      "Session service unavailable"
    );
  });

  it("preserves stale-session errors for reauthentication", async () => {
    const { auth } = createPreloadDependencies();
    auth.listSessions = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "SESSION_NOT_FRESH",
        message: "Session is not fresh",
      },
    });

    const error = await securitySessionsQueryOptions(auth)
      .queryFn()
      .catch((cause: unknown) => cause);

    expect(isSessionNotFreshError(error)).toBe(true);
  });
});
