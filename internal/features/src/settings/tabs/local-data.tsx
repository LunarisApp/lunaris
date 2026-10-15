"use client";

import { ConfirmationDialog } from "@lunarisapp/ui/blocks/confirmation-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@lunarisapp/ui/components/alert-dialog";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@lunarisapp/ui/components/progress";
import { Skeleton } from "@lunarisapp/ui/components/skeleton";
import {
  clearUploadQueue,
  usePowerSync,
  usePowerSyncSession,
  useSyncAccess,
  useSyncBlocker,
  useSyncBlockerState,
} from "@repo/data/core";
import {
  deleteFileStorageDatabases,
  getFileStorageWorkspaceIds,
} from "@repo/data/features/attachments";
import { useStatus } from "@repo/data/features/sync-status";
import { useOnlineStatus, usePlatform } from "@repo/platform";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useAuth } from "../../auth";
import {
  resolveSyncStatus,
  type SyncStatusDescriptor,
} from "../../sync-status";
import { AgentAccessSection } from "./agent-access-section";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1000;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);
  return `${Number.parseFloat((bytes / k ** index).toFixed(1))} ${sizes[index]}`;
}

export function LocalDataContent() {
  const { t } = useTranslation();
  const { navigation } = usePlatform();
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: activeOrganization } = auth.useActiveOrganization();
  const db = usePowerSync();
  const powerSyncSession = usePowerSyncSession();
  const syncAccess = useSyncAccess();
  const status = useStatus();
  const networkOnline = useOnlineStatus();
  const blocker = useSyncBlocker();
  const { blocked, consecutiveClientErrors, lastClientErrorStatus } =
    useSyncBlockerState();

  const [estimate, setEstimate] = useState<{
    usage: number;
    quota: number | null;
  } | null>(null);
  const [queueStats, setQueueStats] = useState<{
    count: number;
    size: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearQueueConfirmOpen, setClearQueueConfirmOpen] = useState(false);
  const [purging, setPurging] = useState(false);

  const loadStorage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [storageEstimate, uploadStats] = await Promise.all([
        powerSyncSession.estimateStorage(),
        db.getUploadQueueStats(true),
      ]);
      setEstimate(storageEstimate);
      setQueueStats({
        count: uploadStats.count,
        size: uploadStats.size ?? null,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("settings.local-data.failedToLoad")
      );
    } finally {
      setLoading(false);
    }
  }, [db, powerSyncSession, t]);

  const clearQueue = useCallback(async () => {
    setClearing(true);
    try {
      await clearUploadQueue(db);
      blocker.resume();
      posthog.capture("upload_queue_cleared");
      await loadStorage();
      setClearQueueConfirmOpen(false);
    } finally {
      setClearing(false);
    }
  }, [blocker, db, loadStorage]);

  const tryAgain = useCallback(async () => {
    blocker.resume();
    await loadStorage();
  }, [blocker, loadStorage]);

  const purgeVFS = useCallback(async () => {
    setPurging(true);
    try {
      let fileStorageWorkspaceIds: string[] = [];
      try {
        fileStorageWorkspaceIds = await getFileStorageWorkspaceIds(db);
      } catch (err) {
        log.warn({
          tag: "Settings",
          msg: "failed to collect file storage workspace ids before purge",
          error: parseError(err),
        });
      }
      await powerSyncSession.purge();
      await deleteFileStorageDatabases(fileStorageWorkspaceIds);
      posthog.capture("storage_purged");
      navigation.reload();
    } catch {
      setPurging(false);
    }
  }, [db, navigation, powerSyncSession]);

  useEffect(() => {
    loadStorage();
  }, [loadStorage]);

  const descriptor = resolveSyncStatus({
    syncAccess,
    blocked,
    lastClientErrorStatus,
    connected: status.connected,
    connecting: status.connecting,
    lastSyncedAt: status.lastSyncedAt,
    networkOnline,
    uploadError: status.dataFlowStatus?.uploadError,
    downloadError: status.dataFlowStatus?.downloadError,
  });

  const usagePercent =
    estimate?.quota && estimate.quota > 0
      ? (estimate.usage / estimate.quota) * 100
      : 0;
  const measurableQuota =
    estimate?.quota && estimate.quota > 0 ? estimate.quota : null;
  const storageUsageText = estimate
    ? estimate.quota === null
      ? formatBytes(estimate.usage)
      : t("settings.local-data.usageOfQuota", {
          used: formatBytes(estimate.usage),
          quota: formatBytes(estimate.quota),
        })
    : "";
  const downloadProgress = status.downloadProgress;
  const downloadProgressValue =
    typeof downloadProgress?.downloadedFraction === "number"
      ? downloadProgress.downloadedFraction * 100
      : 0;
  const showTransferHint =
    (descriptor.kind === "online" || descriptor.kind === "connecting") &&
    (status.dataFlowStatus.uploading || status.dataFlowStatus.downloading);

  return (
    <div className="space-y-10" data-testid="settings-panel-local-data">
      {loading ? (
        <p className="sr-only" role="status">
          {t("common.loading")}
        </p>
      ) : null}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-10" data-testid="settings-local-data-overview">
        <AgentAccessSection />

        <div className="divide-y">
          <section
            aria-labelledby="local-data-sync-health-heading"
            className="space-y-3 pb-5"
          >
            <SyncHealthSection
              blocked={blocked}
              clearing={clearing}
              consecutiveClientErrors={consecutiveClientErrors}
              descriptor={descriptor}
              lastClientErrorStatus={lastClientErrorStatus}
              onClearQueue={() => setClearQueueConfirmOpen(true)}
              onSignIn={() => void navigate("/auth")}
              onSignUp={() => void navigate("/auth/register")}
              onTryAgain={() => void tryAgain()}
              onUpgrade={() =>
                void navigate(
                  activeOrganization
                    ? `/${activeOrganization.slug}/settings?tab=billing`
                    : "/",
                )
              }
            />

            {showTransferHint && (
              <div
                aria-live="polite"
                className="text-muted-foreground flex items-center gap-1 text-xs"
                data-testid="settings-local-data-transfer-hint"
                role="status"
              >
                {status.dataFlowStatus.uploading && (
                  <span>{t("syncStatus.uploading")}</span>
                )}
                {status.dataFlowStatus.uploading &&
                  status.dataFlowStatus.downloading && <span>·</span>}
                {status.dataFlowStatus.downloading && (
                  <span>{t("syncStatus.downloading")}</span>
                )}
              </div>
            )}

            {typeof downloadProgress?.downloadedFraction === "number" && (
              <Progress
                data-testid="settings-local-data-download-progress"
                value={downloadProgressValue}
              >
                <ProgressLabel>
                  {t("settings.local-data.syncHealthDownloadProgressLabel")}
                </ProgressLabel>
                <ProgressValue>
                  {() =>
                    t("settings.local-data.syncHealthDownloadProgressValue", {
                      downloaded:
                        downloadProgress.downloadedOperations ?? 0,
                      total: downloadProgress.totalOperations ?? 0,
                    })
                  }
                </ProgressValue>
              </Progress>
            )}
          </section>

          <section
            aria-labelledby="local-data-storage-heading"
            className="space-y-2 py-5"
          >
            {loading ? (
              <>
                <h2 className="sr-only" id="local-data-storage-heading">
                  {t("settings.local-data.storageUsed")}
                </h2>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-1 w-full" />
              </>
            ) : estimate ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h2
                    className="text-sm font-medium"
                    id="local-data-storage-heading"
                  >
                    {t("settings.local-data.storageUsed")}
                  </h2>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {storageUsageText}
                    {estimate.quota !== null && (
                      <>
                        {" · "}
                        {usagePercent > 0 && usagePercent < 1
                          ? "< 1%"
                          : `${Math.round(usagePercent)}%`}
                      </>
                    )}
                  </p>
                </div>
                <div
                  aria-hidden={measurableQuota === null ? true : undefined}
                  aria-label={
                    measurableQuota === null
                      ? undefined
                      : t("settings.local-data.storageUsed")
                  }
                  aria-valuemax={measurableQuota ?? undefined}
                  aria-valuemin={measurableQuota === null ? undefined : 0}
                  aria-valuenow={
                    measurableQuota === null
                      ? undefined
                      : Math.min(estimate.usage, measurableQuota)
                  }
                  aria-valuetext={
                    measurableQuota === null ? undefined : storageUsageText
                  }
                  className="bg-foreground/15 h-1.5 w-full overflow-hidden rounded-full"
                  role={measurableQuota === null ? undefined : "meter"}
                >
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${Math.max(usagePercent, 0)}%` }}
                  />
                </div>
              </>
            ) : null}
          </section>

          <section
            aria-labelledby="local-data-upload-queue-heading"
            className="flex items-center justify-between gap-3 pt-5"
          >
            {loading ? (
              <>
                <h2 className="sr-only" id="local-data-upload-queue-heading">
                  {t("settings.local-data.uploadQueue")}
                </h2>
                <Skeleton className="h-8 flex-1" />
              </>
            ) : (
              <div className="min-w-0">
                <h2
                  className="text-sm font-medium"
                  id="local-data-upload-queue-heading"
                >
                  {t("settings.local-data.uploadQueue")}
                </h2>
                <p
                  className="text-muted-foreground text-xs"
                  data-testid="settings-local-data-queue-meta"
                >
                  {queueStats && queueStats.count > 0 ? (
                    <>
                      {t("settings.local-data.pendingUploads", {
                        count: queueStats.count,
                      })}
                      {queueStats.size != null &&
                        ` · ${formatBytes(queueStats.size)}`}
                    </>
                  ) : (
                    <span data-testid="settings-local-data-no-pending">
                      {t("settings.local-data.noPendingUploads")}
                    </span>
                  )}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      <section
        aria-labelledby="local-data-danger-zone-heading"
        className="border-destructive/20 space-y-4 border-t pt-6"
      >
        <div className="space-y-1">
          <h2
            className="text-sm font-semibold text-destructive"
            id="local-data-danger-zone-heading"
          >
            {t("settings.local-data.dangerZone")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("settings.local-data.dangerZoneDescription")}
          </p>
        </div>

        <div className="divide-destructive/20 divide-y">
          <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-destructive">
                {t("settings.local-data.clearQueue")}
              </p>
              <p className="text-destructive/80 text-xs">
                {t("settings.local-data.clearQueueDescription")}
              </p>
            </div>
            <Button
              className="w-full shrink-0 sm:w-auto"
              data-testid="settings-local-data-clear-queue"
              disabled={clearing || !queueStats || queueStats.count === 0}
              onClick={() => setClearQueueConfirmOpen(true)}
              size="sm"
              variant="destructive"
            >
              {clearing
                ? t("settings.local-data.clearingQueue")
                : t("settings.local-data.clearQueue")}
            </Button>
          </div>

          <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-destructive">
                {t("settings.local-data.purgeStorage")}
              </p>
              <p className="text-destructive/80 text-xs">
                {t("settings.local-data.purgeStorageDescription")}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger
                disabled={purging}
                nativeButton={false}
                render={
                  <Button
                    className="w-full shrink-0 sm:w-auto"
                    size="sm"
                    variant="destructive"
                  />
                }
              >
                {purging
                  ? t("settings.local-data.purgingStorage")
                  : t("settings.local-data.purgeStorage")}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("settings.local-data.purgeConfirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("settings.local-data.purgeConfirmDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={purgeVFS} variant="destructive">
                    {t("settings.local-data.purgeStorage")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <ConfirmationDialog
          cancelLabel={t("common.cancel")}
          confirmLabel={t("settings.local-data.clearQueue")}
          confirmVariant="destructive"
          description={t("settings.local-data.clearQueueConfirmDescription")}
          onConfirm={() => {
            void clearQueue();
          }}
          onOpenChange={setClearQueueConfirmOpen}
          open={clearQueueConfirmOpen}
          title={t("settings.local-data.clearQueueConfirmTitle")}
        />
      </section>
    </div>
  );
}

type TFn = (key: string, vars?: Record<string, unknown>) => string;

interface SyncHealthSectionProps {
  blocked: boolean;
  clearing: boolean;
  consecutiveClientErrors: number;
  descriptor: SyncStatusDescriptor;
  lastClientErrorStatus: number | null;
  onClearQueue: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onTryAgain: () => void;
  onUpgrade: () => void;
}

function SyncHealthSection({
  blocked,
  clearing,
  consecutiveClientErrors,
  descriptor,
  lastClientErrorStatus,
  onClearQueue,
  onSignIn,
  onSignUp,
  onTryAgain,
  onUpgrade,
}: SyncHealthSectionProps) {
  const { t } = useTranslation();
  const labels = labelsForDescriptor(descriptor, t as TFn);
  const { lastSyncedAt } = descriptor;

  return (
    <div
      className={`space-y-2 ${labels.toneClass}`}
      data-testid="settings-local-data-sync-health"
    >
      <div
        aria-atomic="true"
        aria-live="polite"
        className="space-y-2"
        role="status"
      >
        <h2
          className="text-sm font-semibold"
          id="local-data-sync-health-heading"
        >
          {labels.title}
        </h2>
        {labels.message && (
          <p className="text-muted-foreground text-sm">{labels.message}</p>
        )}
        {labels.reason && (
          <p className="text-muted-foreground text-xs">
            {t("syncStatus.transientErrorReason", { reason: labels.reason })}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          {lastSyncedAt
            ? t("syncStatus.lastSynced", {
                date: lastSyncedAt.toLocaleString(),
              })
            : t("settings.local-data.lastSyncedNever")}
        </p>
        {blocked && consecutiveClientErrors > 0 && (
          <p className="text-muted-foreground text-xs">
            {t("syncStatus.consecutiveClientErrors", {
              count: consecutiveClientErrors,
            })}
          </p>
        )}
        {blocked && lastClientErrorStatus != null && (
          <p className="text-muted-foreground text-xs">
            {t("syncStatus.lastRejectedStatus", {
              status: lastClientErrorStatus,
            })}
          </p>
        )}
      </div>
      <SyncHealthActions
        clearing={clearing}
        descriptor={descriptor}
        onClearQueue={onClearQueue}
        onSignIn={onSignIn}
        onSignUp={onSignUp}
        onTryAgain={onTryAgain}
        onUpgrade={onUpgrade}
        t={t as TFn}
      />
    </div>
  );
}

function SyncHealthActions({
  clearing,
  descriptor,
  onClearQueue,
  onSignIn,
  onSignUp,
  onTryAgain,
  onUpgrade,
  t,
}: {
  clearing: boolean;
  descriptor: SyncStatusDescriptor;
  onClearQueue: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onTryAgain: () => void;
  onUpgrade: () => void;
  t: TFn;
}) {
  switch (descriptor.kind) {
    case "online":
    case "connecting":
    case "offline":
      return null;
    case "local-only-anonymous":
      return (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={onSignUp} size="sm">
            {t("syncStatus.localOnlyAnonymousAction")}
          </Button>
        </div>
      );
    case "blocked-auth":
      return (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={onSignIn} size="sm">
            {t("syncStatus.blockedAuthAction")}
          </Button>
          <Button onClick={onTryAgain} size="sm" variant="secondary">
            {t("settings.local-data.tryAgain")}
          </Button>
          <Button
            disabled={clearing}
            onClick={onClearQueue}
            size="sm"
            variant="destructive"
          >
            {clearing
              ? t("settings.local-data.clearingQueue")
              : t("settings.local-data.clearQueue")}
          </Button>
        </div>
      );
    case "blocked-permission":
      return (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={onUpgrade} size="sm">
            {t("syncStatus.blockedPermissionAction")}
          </Button>
          <Button onClick={onTryAgain} size="sm" variant="secondary">
            {t("settings.local-data.tryAgain")}
          </Button>
          <Button
            disabled={clearing}
            onClick={onClearQueue}
            size="sm"
            variant="destructive"
          >
            {clearing
              ? t("settings.local-data.clearingQueue")
              : t("settings.local-data.clearQueue")}
          </Button>
        </div>
      );
    case "blocked-generic":
      return (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={onTryAgain} size="sm">
            {t("settings.local-data.tryAgain")}
          </Button>
          <Button
            disabled={clearing}
            onClick={onClearQueue}
            size="sm"
            variant="destructive"
          >
            {clearing
              ? t("settings.local-data.clearingQueue")
              : t("settings.local-data.clearQueue")}
          </Button>
        </div>
      );
    case "transient-error":
      return (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={onTryAgain} size="sm" variant="secondary">
            {t("settings.local-data.tryAgain")}
          </Button>
        </div>
      );
    default: {
      const _exhaustive: never = descriptor;
      return _exhaustive;
    }
  }
}

interface DescriptorLabels {
  message: string;
  reason?: string;
  title: string;
  toneClass: string;
}

function labelsForDescriptor(
  descriptor: SyncStatusDescriptor,
  t: TFn
): DescriptorLabels {
  switch (descriptor.kind) {
    case "online":
      return {
        title: t("syncStatus.onlineStatus"),
        message: "",
        toneClass: "",
      };
    case "connecting":
      return {
        title: t("syncStatus.connectingStatus"),
        message: "",
        toneClass: "",
      };
    case "offline":
      return {
        title: t("syncStatus.offlineMode"),
        message: t("syncStatus.offlineMessage"),
        toneClass: "",
      };
    case "local-only-anonymous":
      return {
        title: t("syncStatus.localOnlyAnonymousMode"),
        message: t("syncStatus.localOnlyAnonymousMessage"),
        toneClass: "text-amber-700 dark:text-amber-400",
      };
    case "blocked-auth":
      return {
        title: t("syncStatus.blockedAuthMode"),
        message: t("syncStatus.blockedAuthMessage"),
        toneClass: "text-destructive",
      };
    case "blocked-permission":
      return {
        title: t("syncStatus.blockedPermissionMode"),
        message: t("syncStatus.blockedPermissionMessage"),
        toneClass: "text-amber-700 dark:text-amber-400",
      };
    case "blocked-generic":
      return {
        title: t("syncStatus.blockedMode"),
        message: t("syncStatus.blockedMessage"),
        toneClass: "text-amber-700 dark:text-amber-400",
      };
    case "transient-error":
      return {
        title: t("syncStatus.transientErrorMode"),
        message: t("syncStatus.transientErrorMessage"),
        toneClass: "text-amber-700 dark:text-amber-400",
        reason: descriptor.reason,
      };
    default: {
      const _exhaustive: never = descriptor;
      return _exhaustive;
    }
  }
}
