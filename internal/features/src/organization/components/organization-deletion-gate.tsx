import { useNavigate } from "react-router";
import { useRegion } from "@repo/features/region";
import { Button } from "@lunarisapp/ui/components/button";
import { Spinner } from "@lunarisapp/ui/components/spinner";
import { useApi } from "@repo/features/api";
import { LoaderView } from "@repo/features/loading";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  usePowerSync,
  usePowerSyncSession,
  useSyncBlocker,
} from "@repo/data/core";
import { discardOrganizationUploads } from "@repo/data/features/organizations";
import { useTranslation } from "react-i18next";
import { OrganizationSelector } from "./organization-selector";

export interface OrganizationDeletionStatus {
  billingStopped: boolean;
  canRestore: boolean;
  purgeAfter: string | null;
  status: "active" | "scheduled" | "purging" | "unavailable";
  success: boolean;
  workspaceIds: string[];
}

export const organizationDeletionKey = (organizationId: string) =>
  ["organization-deletion", organizationId] as const;

export const organizationDeletionRedirectKey = (organizationId: string) =>
  ["organization-deletion-redirect", organizationId] as const;

const isRecoveryPending = (
  status?: OrganizationDeletionStatus,
  failed = false
) =>
  !status ||
  status.status === "scheduled" ||
  status.status === "purging" ||
  (status.status === "active" && failed);

export function OrganizationDeletionGate({
  children,
  organizationId,
  purgeAfter,
  requestedAt,
  isAnonymous,
}: {
  children: ReactNode;
  organizationId: string;
  purgeAfter?: string | null;
  requestedAt?: string | null;
  isAnonymous: boolean;
}) {
  const api = useApi();
  const navigate = useNavigate();
  const { pathWithRegion } = useRegion();
  const db = usePowerSync();
  const syncSession = usePowerSyncSession();
  const syncBlocker = useSyncBlocker();
  const [isClearing, setIsClearing] = useState(false);
  const cleared = useRef<string | null>(null);
  const [cleanupFailed, setCleanupFailed] = useState(false);
  const [clearedKey, setClearedKey] = useState<string | null>(null);
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const syncedDeletion = Boolean(requestedAt || purgeAfter);
  const previousSync = useRef({ organizationId, syncedDeletion });
  const restore = useMutation({
    onMutate: () =>
      client.cancelQueries({
        queryKey: organizationDeletionKey(organizationId),
        exact: true,
      }),
    mutationFn: () =>
      api.post<OrganizationDeletionStatus>("/v1/organization/restore", {
        body: { organizationId },
      }),
    onSuccess: async (status) => {
      await client.cancelQueries({
        queryKey: organizationDeletionKey(organizationId),
        exact: true,
      });
      client.setQueryData(
        organizationDeletionRedirectKey(organizationId),
        null
      );
      syncBlocker.resume();
      client.setQueryData(organizationDeletionKey(organizationId), status);
    },
  });
  // Keep local navigation observed until cleanup finishes, even if it takes
  // longer than the query cache's garbage-collection window.
  const { data: nextOrganizationSlug } = useQuery<string | null>({
    queryKey: organizationDeletionRedirectKey(organizationId),
    queryFn: skipToken,
  });
  const query = useQuery({
    queryKey: organizationDeletionKey(organizationId),
    queryFn: () =>
      api.post<OrganizationDeletionStatus>("/v1/organization/deletion-status", {
        body: { organizationId },
      }),
    enabled: (query) =>
      !(isAnonymous || restore.isPending) &&
      (syncedDeletion ||
        Boolean(query.state.data && isRecoveryPending(query.state.data))),
    networkMode: "online",
    retry: false,
    refetchInterval: (query) =>
      isRecoveryPending(query.state.data, query.state.status === "error")
        ? 10_000
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: (query) =>
      isRecoveryPending(query.state.data, query.state.status === "error"),
    refetchOnReconnect: (query) =>
      isRecoveryPending(query.state.data, query.state.status === "error"),
  });
  const { refetch } = query;
  useEffect(() => {
    if (restore.isPending) {
      return;
    }
    const previous = previousSync.current;
    previousSync.current = { organizationId, syncedDeletion };
    if (
      isAnonymous ||
      previous.organizationId !== organizationId ||
      previous.syncedDeletion === syncedDeletion
    ) {
      return;
    }
    let cancelled = false;
    const reconcile = async () => {
      // A restoration must supersede even the first pending recovery request.
      // refetch's cancelRefetch alone only cancels requests with cached data.
      if (!syncedDeletion) {
        await client.cancelQueries({
          queryKey: organizationDeletionKey(organizationId),
          exact: true,
        });
      }
      if (!cancelled) {
        await refetch({ cancelRefetch: false });
      }
    };
    void reconcile();
    return () => {
      cancelled = true;
    };
  }, [
    client,
    isAnonymous,
    organizationId,
    syncedDeletion,
    refetch,
    restore.isPending,
  ]);
  useEffect(() => {
    if (isAnonymous) {
      return;
    }
    const status = query.data;
    if (!status || status.status === "active") {
      cleared.current = null;
      return;
    }
    const key = `${organizationId}:${status.purgeAfter}`;
    if (cleared.current === key) {
      return;
    }
    cleared.current = key;
    setIsClearing(true);
    const discard = async () => {
      // Drain in-flight uploads before editing their queue.
      await syncSession.disconnect();
      try {
        await discardOrganizationUploads(
          db,
          organizationId,
          status.workspaceIds
        );
        syncBlocker.resume();
      } finally {
        await syncSession.connect();
      }
    };
    void discard()
      .then(() => {
        setCleanupFailed(false);
        setClearedKey(key);
        setIsClearing(false);
      })
      .catch(() => {
        setCleanupFailed(true);
        setIsClearing(false);
      });
  }, [
    cleanupFailed,
    db,
    organizationId,
    query.data,
    query.dataUpdatedAt,
    syncSession,
    syncBlocker,
    isAnonymous,
  ]);
  useEffect(() => {
    if (
      isAnonymous ||
      !nextOrganizationSlug ||
      isClearing ||
      cleanupFailed ||
      !query.data ||
      query.data.status === "active" ||
      clearedKey !== `${organizationId}:${query.data.purgeAfter}`
    ) {
      return;
    }
    client.setQueryData(organizationDeletionRedirectKey(organizationId), null);
    navigate(pathWithRegion(`/${nextOrganizationSlug}`), { replace: true });
  }, [
    client,
    clearedKey,
    cleanupFailed,
    isAnonymous,
    isClearing,
    navigate,
    nextOrganizationSlug,
    organizationId,
    pathWithRegion,
    query.data,
  ]);
  if (isAnonymous) {
    return children;
  }
  const scheduled =
    syncedDeletion || Boolean(query.data && query.data.status !== "active");
  if (!scheduled) {
    return isClearing ? <LoaderView /> : children;
  }
  const deadline = query.data?.purgeAfter ?? purgeAfter;
  const date = deadline
    ? new Date(deadline).toLocaleString(i18n.language, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "";
  const restoreBusy = restore.isPending || isClearing;
  return (
    <main className="flex min-h-full w-full flex-1 items-center justify-center overflow-y-auto bg-background px-5 py-10 text-foreground sm:px-8 sm:py-16">
      <section
        aria-labelledby="organization-recovery-title"
        className="w-full max-w-lg"
      >
        <header className="space-y-4">
          <h1
            id="organization-recovery-title"
            className="text-balance font-semibold text-2xl leading-snug"
          >
            {t(
              query.data?.status === "unavailable"
                ? "organization.deletionUnavailableTitle"
                : "organization.deletionScheduledTitle"
            )}
          </h1>
          <p className="text-pretty text-muted-foreground text-sm leading-relaxed">
            {t(
              query.data?.status === "unavailable"
                ? "organization.deletionUnavailable"
                : query.data?.status === "purging"
                  ? "organization.deletionPurging"
                  : "organization.deletionScheduledDescription",
              { date }
            )}
          </p>
        </header>
        {!!query.data?.canRestore && (
          <div className="mt-6">
            <Button
              className="h-11 w-full sm:w-auto"
              aria-busy={restoreBusy}
              disabled={
                restore.isPending ||
                clearedKey !== `${organizationId}:${query.data.purgeAfter}`
              }
              onClick={() => restore.mutate()}
            >
              {!!restoreBusy && (
                <Spinner
                  aria-hidden="true"
                  className="motion-reduce:animate-none"
                />
              )}
              {t("organization.restoreOrganization")}
            </Button>
          </div>
        )}
        {!!(restore.isError || query.isError || cleanupFailed) && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-destructive text-sm leading-relaxed"
          >
            {t("organization.deletionActionFailed")}
          </p>
        )}
        {!!cleanupFailed && (
          <Button
            onClick={() => {
              cleared.current = null;
              setCleanupFailed(false);
            }}
          >
            {t("common.retry")}
          </Button>
        )}
        {query.data?.status !== "unavailable" && (
          <section
            aria-labelledby="organization-recovery-billing"
            className="mt-8 space-y-2 border-border border-t pt-6"
          >
            <h2
              id="organization-recovery-billing"
              className="font-medium text-sm"
            >
              {t("organization.billing.title")}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t(
                query.data?.billingStopped
                  ? "organization.deletionBillingStopped"
                  : "organization.deletionBillingPending"
              )}
            </p>
          </section>
        )}
        <section
          aria-labelledby="organization-recovery-switch"
          className="mt-6 space-y-3 border-border border-t pt-6"
        >
          <h2 id="organization-recovery-switch" className="font-medium text-sm">
            {t("workspaces.switchOrganization")}
          </h2>
          <OrganizationSelector excludedOrganizationId={organizationId} />
        </section>
      </section>
    </main>
  );
}
