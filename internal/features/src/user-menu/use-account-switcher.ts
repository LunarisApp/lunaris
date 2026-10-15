import type { AuthClient } from "@repo/auth/client";
import { type PowerSyncSession, usePowerSyncSession } from "@repo/data/core";
import {
  getUserFacingDescription,
  getUserFacingError,
} from "@repo/data/http";
import { useQuery } from "@tanstack/react-query";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  buildAddAccountPath,
  createAccountSwitchNavigationState,
} from "../auth/redirect";
import { useAuth } from "../auth/context";
import { useRegion } from "../region";

interface AccountSession {
  session: {
    token: string;
  };
  user: {
    email: string;
    id: string;
    image?: string | null;
    name: string;
  };
}

const accountSwitcherQueryKeys = {
  deviceSessions: (userId: string | undefined) =>
    ["auth", "device-sessions", userId] as const,
};

function deviceSessionsQueryOptions(
  auth: AuthClient,
  currentUserId: string | undefined,
) {
  return {
    enabled: currentUserId !== undefined,
    networkMode: "online" as const,
    placeholderData: (previousData: AccountSession[] | undefined) =>
      previousData?.some((account) => account.user.id === currentUserId)
        ? previousData
        : undefined,
    queryFn: async (): Promise<AccountSession[]> => {
      const { data, error } = await auth.multiSession.listDeviceSessions();
      if (error) {
        log.warn({
          tag: "Auth",
          msg: "account session list failed",
          error: parseError(error),
        });
        throw error;
      }
      return Array.isArray(data) ? data.filter(isAccountSession) : [];
    },
    queryKey: accountSwitcherQueryKeys.deviceSessions(currentUserId),
  };
}

export async function activateAccountSession({
  authClient,
  beforeSwitch,
  powerSyncSession,
  sessionToken,
}: {
  authClient: AuthClient;
  beforeSwitch?: () => void;
  powerSyncSession: PowerSyncSession;
  sessionToken: string;
}) {
  beforeSwitch?.();
  await powerSyncSession.disconnect();

  try {
    const result = await authClient.multiSession.setActive({ sessionToken });
    if (result.error) await powerSyncSession.connect();
    return result;
  } catch (error) {
    await powerSyncSession.connect();
    throw error;
  }
}

function isAccountSession(value: unknown): value is AccountSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    session?: Record<string, unknown>;
    user?: Record<string, unknown>;
  };
  return (
    typeof candidate.session?.token === "string" &&
    typeof candidate.user?.email === "string" &&
    typeof candidate.user.id === "string" &&
    typeof candidate.user.name === "string"
  );
}

export function useAccountSwitcher() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { data: currentSession, refetch: refetchSession } =
    auth.useSession();
  const powerSyncSession = usePowerSyncSession();
  const { pathWithRegion } = useRegion();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSwitching, setIsSwitching] = useState(false);

  const currentAccount = isAccountSession(currentSession)
    ? currentSession
    : null;
  const currentUserId = currentAccount?.user.id;
  const deviceSessionsQuery = useQuery(
    deviceSessionsQueryOptions(auth, currentUserId),
  );
  const accountListStatus =
    deviceSessionsQuery.fetchStatus === "paused"
      ? "offline"
      : deviceSessionsQuery.isError
        ? "error"
        : "ready";
  const deviceSessions =
    accountListStatus === "ready" ? (deviceSessionsQuery.data ?? []) : [];
  const accountsByUserId = new Map(
    deviceSessions.map((account) => [account.user.id, account]),
  );
  if (currentAccount) {
    accountsByUserId.set(currentAccount.user.id, currentAccount);
  }
  const accounts = [...accountsByUserId.values()].sort((left, right) => {
    if (left.user.id === currentUserId) return -1;
    if (right.user.id === currentUserId) return 1;
    return left.user.email.localeCompare(right.user.email);
  });

  const refreshAccounts = useCallback(async () => {
    await deviceSessionsQuery.refetch();
  }, [deviceSessionsQuery.refetch]);

  const switchAccount = useCallback(
    async (account: AccountSession) => {
      if (account.user.id === currentUserId || isSwitching) {
        return;
      }

      setIsSwitching(true);
      const previousPath = `${location.pathname}${location.search}${location.hash}`;
      let accountActivated = false;
      const showError = (error: unknown) => {
        const userFacing = getUserFacingError(error);
        toast.error(t(userFacing.titleKey), {
          description: getUserFacingDescription(userFacing, t),
        });
      };
      try {
        const result = await activateAccountSession({
          authClient: auth,
          beforeSwitch: () => {
            flushSync(() => {
              navigate(pathWithRegion("/"), {
                replace: true,
                state: createAccountSwitchNavigationState(account.user.id),
              });
            });
          },
          powerSyncSession,
          sessionToken: account.session.token,
        });
        if (result.error) {
          navigate(previousPath, { replace: true });
          showError(result.error);
          return;
        }
        accountActivated = true;
        await refetchSession({ query: { disableCookieCache: true } });
        posthog.capture("auth_account_switched");
      } catch (error) {
        log.error({
          tag: "Auth",
          msg: "account switch failed",
          error: parseError(error),
        });
        if (!accountActivated) navigate(previousPath, { replace: true });
        showError(error);
      } finally {
        setIsSwitching(false);
      }
    },
    [
      auth,
      currentUserId,
      isSwitching,
      location.hash,
      location.pathname,
      location.search,
      navigate,
      pathWithRegion,
      powerSyncSession,
      refetchSession,
      t,
    ],
  );

  const addAccount = useCallback(() => {
    navigate(buildAddAccountPath(pathWithRegion("/auth")));
  }, [navigate, pathWithRegion]);

  return {
    accountListStatus,
    accounts,
    addAccount,
    currentUserId,
    isSwitching,
    refreshAccounts,
    switchAccount,
  };
}
