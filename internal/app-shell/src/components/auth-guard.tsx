import { Button } from "@lunarisapp/ui/components/button";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import {
  getUserFacingDescription,
  getUserFacingError,
} from "@repo/data/http";
import {
  buildAuthRedirectPath,
  getAccountSwitchTargetUserId,
} from "@repo/features/auth/redirect";
import { LoaderView } from "@repo/features/loading";
import { useRegion, useRegionClients } from "@repo/features/region";
import { resetPostHogIdentity } from "@repo/utils/posthog-browser";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useLocation } from "react-router";
import { logout } from "@repo/features/auth/logout";
import { PowerSyncBoundary } from "./power-sync-boundary";
import {
  clearActivePowerSyncSession,
  getActivePowerSyncSession,
} from "./power-sync-session-coordinator";

function RedirectToAuth() {
  const { pathWithRegion } = useRegion();
  const location = useLocation();
  return (
    <Navigate
      replace
      to={buildAuthRedirectPath(pathWithRegion("/auth"), location)}
    />
  );
}

export default function AuthGuard() {
  const { t } = useTranslation();
  const { pathWithRegion } = useRegion();
  const { authClient, manifest } = useRegionClients();
  const location = useLocation();
  if (!authClient || !manifest) {
    return <LoaderView />;
  }

  const {
    data: session,
    isPending,
    error: sessionError,
    refetch: refetchSession,
  } = authClient.useSession();
  const {
    data: activeOrg,
    error: activeOrgError,
    isPending: activeOrgPending,
    refetch: refetchActiveOrganization,
  } = authClient.useActiveOrganization();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const userId = session?.user.id;
  const sessionId = session?.session.id;
  const telemetryIdentity = useRef<string | null | undefined>(undefined);
  const resolvingOrganizationUserId = useRef<string | null>(null);
  const [orgResolutionFailureUserId, setOrgResolutionFailureUserId] =
    useState<string | null>(null);
  const [orgResolutionError, setOrgResolutionError] = useState<{
    cause: unknown;
    userId: string;
  } | null>(null);
  const orgResolutionFailed =
    !!userId && orgResolutionFailureUserId === userId;
  const currentOrgResolutionError =
    userId && orgResolutionError?.userId === userId
      ? orgResolutionError.cause
      : null;
  const sessionOrganizationId = session?.session.activeOrganizationId;
  const resolvedActiveOrg =
    activeOrg?.id === sessionOrganizationId ? activeOrg : null;
  const accountSwitchTargetUserId = getAccountSwitchTargetUserId(
    location.state,
  );

  useEffect(() => {
  }, [manifest.apiUrl, sessionId]);

  // Stable product identity shared by analytics, exceptions, traces, and logs.
  // Deliberately exclude names and email addresses from analytics profiles.
  useEffect(() => {
    if (isPending) return;
    if (session?.user) {
      const identity = `${session.user.id}:${session.user.isAnonymous}`;
      if (telemetryIdentity.current === identity) return;
      posthog.identify(session.user.id, {
        is_anonymous: session.user.isAnonymous,
      });
      telemetryIdentity.current = identity;
      return;
    }

    if (telemetryIdentity.current !== null) {
      resetPostHogIdentity(posthog);
      telemetryIdentity.current = null;
    }
  }, [isPending, session?.user]);

  // Organization ID enables group analytics without copying organization names.
  useEffect(() => {
    if (resolvedActiveOrg) {
      posthog.group("organization", resolvedActiveOrg.id);
    }
  }, [resolvedActiveOrg]);

  // Session exists but no active org (race condition on signup).
  // Resolve by setting the first available org as active.
  const needsOrgResolution =
    !!session &&
    !sessionOrganizationId &&
    !activeOrgPending &&
    !isPending;

  useEffect(() => {
    if (
      !needsOrgResolution ||
      !userId ||
      orgResolutionFailed ||
      currentOrgResolutionError ||
      resolvingOrganizationUserId.current === userId
    ) {
      return;
    }
    let cancelled = false;
    resolvingOrganizationUserId.current = userId;
    const isCurrent = () =>
      !cancelled && resolvingOrganizationUserId.current === userId;

    const resolve = async () => {
      const { data: orgs, error } = await authClient.organization.list();
      if (!isCurrent()) return;
      if (error) throw error;
      const firstOrg = orgs?.[0];
      if (!firstOrg) {
        log.warn({
          action: "auth.organization.resolve",
          outcome: "not_found",
          auth: { nextAction: "logout" },
          organization: { availableCount: 0 },
        });
        resolvingOrganizationUserId.current = null;
        setOrgResolutionFailureUserId(userId);
        return;
      }

      const activation = await authClient.organization.setActive({
        organizationId: firstOrg.id,
      });
      if (!isCurrent()) return;
      if (activation.error) throw activation.error;
      await Promise.all([
        refetchSession({ query: { disableCookieCache: true } }),
        refetchActiveOrganization(),
      ]);
      if (!isCurrent()) return;
      setOrgResolutionError(null);
      log.info({
        action: "auth.organization.resolve",
        outcome: "success",
        organization: { id: firstOrg.id },
      });
    };

    queueMicrotask(() => {
      if (!isCurrent()) return;
      resolve().catch((err) => {
        if (!isCurrent()) return;
        log.error({
          action: "auth.organization.resolve",
          outcome: "failure",
          auth: { nextAction: "retry" },
          error: parseError(err),
        });
        resolvingOrganizationUserId.current = null;
        setOrgResolutionError({ cause: err, userId });
      });
    });
    return () => {
      cancelled = true;
      if (resolvingOrganizationUserId.current === userId) {
        resolvingOrganizationUserId.current = null;
      }
    };
  }, [
    authClient,
    currentOrgResolutionError,
    needsOrgResolution,
    orgResolutionFailed,
    refetchActiveOrganization,
    refetchSession,
    userId,
  ]);

  const logoutReason =
    session && !resolvedActiveOrg && orgResolutionFailed
      ? "organization_not_found"
      : null;

  useEffect(() => {
    if (!logoutReason) return;
    log.warn({
      action: "auth.organization.resolve",
      outcome: "logout",
      auth: { reason: logoutReason },
    });
    setIsLoggingOut(true);
    void logout({
      authClient,
      powerSyncSession: getActivePowerSyncSession(),
    }).finally(() => {
      clearActivePowerSyncSession();
      setIsLoggingOut(false);
    });
  }, [authClient, logoutReason, manifest.apiUrl]);

  const missingResolvedOrganization =
    !!sessionOrganizationId &&
    !resolvedActiveOrg &&
    !activeOrgPending &&
    !isPending;
  const mismatchKey =
    sessionOrganizationId && activeOrg && !resolvedActiveOrg
      ? JSON.stringify([userId, sessionOrganizationId, activeOrg.id])
      : null;
  const [reconciledMismatch, setReconciledMismatch] = useState<string | null>(null);

  // Mutation listeners refresh these stores separately. A stale response can
  // briefly pair one organization's session with another organization's data.
  // Reconcile once before treating that pair as a permanent access failure.
  useEffect(() => {
    if (!mismatchKey) {
      setReconciledMismatch(null);
      return;
    }
    if (reconciledMismatch === mismatchKey) return;
    let cancelled = false;
    void Promise.allSettled([
      refetchSession({ query: { disableCookieCache: true } }),
      refetchActiveOrganization(),
    ]).then(() => {
      if (!cancelled) setReconciledMismatch(mismatchKey);
    });
    return () => {
      cancelled = true;
    };
  }, [mismatchKey, reconciledMismatch, refetchSession, refetchActiveOrganization]);

  const reconcilingOrganization =
    mismatchKey !== null && reconciledMismatch !== mismatchKey;
  const missingOrganizationError =
    missingResolvedOrganization &&
    !reconcilingOrganization &&
    (!accountSwitchTargetUserId || activeOrgError)
      ? activeOrgError ?? new Error("Active organization is unavailable")
      : null;
  const blockingError =
    (!isPending && !session && sessionError) ||
    currentOrgResolutionError ||
    missingOrganizationError;

  if (blockingError) {
    const userFacingError = getUserFacingError(blockingError);
    return (
      <PanelError
        actions={
          <Button
            onClick={() => {
              resolvingOrganizationUserId.current = null;
              setOrgResolutionError(null);
              setReconciledMismatch(null);
              void Promise.allSettled([
                refetchSession({ query: { disableCookieCache: true } }),
                refetchActiveOrganization(),
              ]);
            }}
          >
            {t("common.retry")}
          </Button>
        }
        description={getUserFacingDescription(userFacingError, t)}
        title={t(userFacingError.titleKey)}
        variant="error"
      />
    );
  }

  if (isPending || activeOrgPending || isLoggingOut || reconcilingOrganization) {
    return <LoaderView />;
  }

  if (!session) {
    return <RedirectToAuth />;
  }

  const isAnonymous = session.user.isAnonymous;
  const needsVerification = !isAnonymous && !session.user.emailVerified;
  if (needsVerification) {
    return <Navigate replace to={pathWithRegion("/auth/verify-email")} />;
  }

  const needsOnboarding =
    !isAnonymous &&
    localStorage.getItem("lunaris_pending_onboarding") &&
    !localStorage.getItem("lunaris_onboarding_completed");
  if (needsOnboarding) {
    return <Navigate replace to={pathWithRegion("/auth/onboarding")} />;
  }

  // Show loader while resolving missing active org
  if (needsOrgResolution && !orgResolutionFailed) {
    return <LoaderView />;
  }

  if (!resolvedActiveOrg) {
    return <LoaderView />;
  }

  return (
    <PowerSyncBoundary>
      <Outlet />
    </PowerSyncBoundary>
  );
}
