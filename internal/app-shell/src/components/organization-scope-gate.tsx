import { OrganizationDeletionGate } from "@repo/features/organization/components/organization-deletion-gate";
import { Button } from "@lunarisapp/ui/components/button";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import { hasOrganizationPermission } from "@repo/auth/permissions";
import {
  useOrganizationMemberRoleQuery,
  useOrganizationsQuery,
} from "@repo/data/features/organizations";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { LoaderView } from "@repo/features/loading";
import {
  PermissionProvider,
  usePermissionCheck,
} from "@repo/features/permissions";
import { useRegionClients } from "@repo/features/region";
import { readPendingOrganization } from "@repo/features/organization/pending-organization";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useParams } from "react-router";
import { OrganizationNotFound } from "./organization-not-found";

type ResolutionError =
  | { kind: "not-found" }
  | { cause: unknown; kind: "switch-failed" };

/**
 * Reads `:organizationSlug` from the URL and ensures Better Auth's active
 * organization matches it. If the URL slug differs from the active org,
 * looks up the org in the PowerSync organization directory, calls Better Auth's
 * `setActive`, and refreshes the auth stores so org-scoped workspace sync boots
 * with fresh credentials.
 *
 * Renders `<Outlet />` only when the URL organization matches the active org.
 * Shows a loader while resolving, and `OrganizationNotFound` when the slug
 * does not belong to any org the user is a member of.
 *
 * Pattern: mirrors `auth-guard.tsx`'s `orgResolutionRef` flow.
 */
export function OrganizationScopeGate() {
  const { organizationSlug } = useParams<{ organizationSlug: string }>();
  const { authClient } = useRegionClients();
  const { data: activeOrg } = authClient?.useActiveOrganization() ?? {
    data: null,
  };
  const { data: session } = authClient?.useSession() ?? { data: null };
  const organizations = useOrganizationsQuery();
  if (!activeOrg || activeOrg.slug !== organizationSlug) {
    return <OrganizationScopeContent />;
  }
  const syncedOrganization = organizations.data?.find(
    (org) => org.id === activeOrg.id
  );
  return (
    <OrganizationDeletionGate
      key={activeOrg.id}
      organizationId={activeOrg.id}
      isAnonymous={session?.user?.isAnonymous === true}
      requestedAt={syncedOrganization?.deletion_requested_at}
      purgeAfter={syncedOrganization?.deletion_purge_after}
    >
      <OrganizationScopeContent />
    </OrganizationDeletionGate>
  );
}

function OrganizationScopeContent() {
  const { t } = useTranslation();
  const { organizationSlug } = useParams<{ organizationSlug: string }>();
  const { authClient } = useRegionClients();
  const resolutionRef = useRef<"idle" | "resolving" | "failed">("idle");
  const organizationSlugRef = useRef(organizationSlug);
  organizationSlugRef.current = organizationSlug;
  const [error, setError] = useState<ResolutionError | null>(null);
  const [resolutionRevision, setResolutionRevision] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { data: activeOrg, refetch: refetchActiveOrganization } =
    authClient?.useActiveOrganization() ?? { data: null };
  const { data: session, refetch: refetchSession } =
    authClient?.useSession() ?? { data: null };
  const organizationsQuery = useOrganizationsQuery();
  const roleQuery = useOrganizationMemberRoleQuery(
    activeOrg?.id,
    session?.user?.id
  );
  const pendingOrganization = readPendingOrganization();
  const pendingOrganizationId = pendingOrganization?.id;
  const pendingRouteMatches = pendingOrganization?.slug === organizationSlug;
  const isPendingOrganization =
    pendingOrganizationId === activeOrg?.id && pendingRouteMatches;
  const parentPermissionCheck = usePermissionCheck();
  const organizationRole =
    roleQuery.data ??
    (session?.user?.isAnonymous === true || isPendingOrganization
      ? "owner"
      : null);
  const permissionCheck = useCallback(
    (required: Parameters<typeof parentPermissionCheck>[0]) =>
      parentPermissionCheck(required) &&
      hasOrganizationPermission(organizationRole, required),
    [parentPermissionCheck, organizationRole]
  );

  const activeOrgId = activeOrg?.id;
  const activeOrgSlug = activeOrg?.slug;
  const slugMatches =
    !!organizationSlug &&
    (activeOrgSlug === organizationSlug || isPendingOrganization);
  const anonymousSlugMismatch =
    session?.user?.isAnonymous === true &&
    !!activeOrgSlug &&
    !!organizationSlug &&
    !slugMatches;
  const activeOrganizationIsSynced = organizationsQuery.data?.some(
    (organization) => organization.id === activeOrgId
  );
  const useActiveFallback =
    session?.user?.isAnonymous === true ||
    isPendingOrganization ||
    organizationsQuery.isLoading;
  const organizationMatches =
    slugMatches && (activeOrganizationIsSynced || useActiveFallback);
  const roleIsReady =
    session?.user?.isAnonymous === true ||
    isPendingOrganization ||
    roleQuery.data != null;
  const scopeMatches = organizationMatches && roleIsReady;

  // Reset resolution state when the URL slug changes.
  useEffect(() => {
    setError(null);
    if (resolutionRef.current === "failed") {
      resolutionRef.current = "idle";
    }
  }, [organizationSlug]);

  useEffect(() => {
    if (
      !(authClient && organizationSlug && activeOrgSlug) ||
      organizationsQuery.isLoading
    ) {
      return;
    }
    if (organizationMatches) {
      return;
    }
    if (resolutionRef.current !== "idle") {
      return;
    }
    resolutionRef.current = "resolving";

    const resolve = async () => {
      const match = organizationsQuery.data?.find(
        (organization) => organization.slug === organizationSlug
      );
      const targetOrganizationId =
        match?.id ?? (pendingRouteMatches ? pendingOrganizationId : undefined);
      if (!targetOrganizationId) {
        if (organizationsQuery.isFetching) {
          resolutionRef.current = "idle";
          return;
        }
        log.warn({
          action: "organization.switch",
          outcome: "not_found",
          organization: { activeId: activeOrgId },
        });
        resolutionRef.current = "failed";
        setError({ kind: "not-found" });
        return;
      }

      const result = await authClient.organization.setActive({
        organizationId: targetOrganizationId,
      });
      if (result.error) {
        throw result.error;
      }
      log.info({
        action: "organization.switch",
        outcome: "success",
        organization: { id: targetOrganizationId, previousId: activeOrgId },
      });
      await Promise.all([
        refetchSession?.({ query: { disableCookieCache: true } }),
        refetchActiveOrganization?.(),
      ]);
      resolutionRef.current = "idle";
      if (!mountedRef.current) {
        return;
      }
      if (organizationSlugRef.current !== organizationSlug) {
        setResolutionRevision((revision) => revision + 1);
        return;
      }
      posthog.capture("organization_switched");
    };

    resolve().catch((err) => {
      if (!mountedRef.current) {
        return;
      }
      if (organizationSlugRef.current !== organizationSlug) {
        resolutionRef.current = "idle";
        setResolutionRevision((revision) => revision + 1);
        return;
      }
      log.error({
        action: "organization.switch",
        outcome: "failure",
        organization: { activeId: activeOrgId },
        error: parseError(err),
      });
      resolutionRef.current = "failed";
      setError({ cause: err, kind: "switch-failed" });
    });
  }, [
    activeOrgId,
    activeOrgSlug,
    authClient,
    error,
    organizationMatches,
    pendingRouteMatches,
    pendingOrganizationId,
    refetchActiveOrganization,
    refetchSession,
    resolutionRevision,
    organizationsQuery.data,
    organizationsQuery.isFetching,
    organizationsQuery.isLoading,
    organizationSlug,
  ]);

  if (!organizationSlug) {
    return <OrganizationNotFound />;
  }
  if (anonymousSlugMismatch) {
    return <OrganizationNotFound />;
  }
  if (error?.kind === "not-found") {
    return <OrganizationNotFound />;
  }
  if (error?.kind === "switch-failed") {
    const userFacingError = getUserFacingError(error.cause);
    return (
      <PanelError
        actions={
          <Button
            onClick={() => {
              resolutionRef.current = "idle";
              setError(null);
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
  if (organizationsQuery.error && !scopeMatches) {
    throw organizationsQuery.error;
  }
  if (!(authClient && activeOrgSlug)) {
    return <LoaderView />;
  }
  if (!scopeMatches) {
    return <LoaderView />;
  }

  return (
    <PermissionProvider check={permissionCheck}>
      <Outlet />
    </PermissionProvider>
  );
}
