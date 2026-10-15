import { Alert, AlertDescription, AlertTitle } from "@lunarisapp/ui/components/alert";
import { Button } from "@lunarisapp/ui/components/button";
import { Progress } from "@lunarisapp/ui/components/progress";
import { permission } from "@repo/auth/permissions";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { useApi } from "@repo/features/api";
import { usePermission } from "@repo/features/permissions";
import { usePlatform } from "@repo/platform";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import posthog from "posthog-js";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

export type BackupStatus =
  | "expired"
  | "failed"
  | "processing"
  | "queued"
  | "ready";

export interface OrganizationBackup {
  archiveSizeBytes: number | null;
  completedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  failureCode: string | null;
  filename: string | null;
  id: string;
  phase:
    | "archiving"
    | "expired"
    | "failed"
    | "finalizing"
    | "queued"
    | "ready"
    | "snapshotting";
  progress: {
    processedBytes: number;
    processedFiles: number;
    totalBytes: number | null;
    totalFiles: number | null;
  };
  status: BackupStatus;
}

const backupKeys = {
  current: ["organization", "backup", "current"] as const,
  detail: (id: string) => ["organization", "backup", id] as const,
};

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const NUMBER_FORMATTER = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

export function BackupsSection() {
  const api = useApi();
  const { downloads } = usePlatform();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedBackupId = searchParams.get("backup");
  const canCreate = usePermission(permission.backup.create);
  const canRead = usePermission(permission.backup.read);
  const queryKey = requestedBackupId
    ? backupKeys.detail(requestedBackupId)
    : backupKeys.current;

  const backupQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (requestedBackupId) {
        return api.get<OrganizationBackup>(
          `/v1/organization/backups/${requestedBackupId}`,
        );
      }
      const result = await api.get<{ backup: OrganizationBackup | null }>(
        "/v1/organization/backups/current",
      );
      return result.backup;
    },
    enabled: canRead,
    refetchInterval: (query) => {
      const status = (query.state.data as OrganizationBackup | null)?.status;
      return status === "queued" || status === "processing" ? 2000 : false;
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<OrganizationBackup>("/v1/organization/backups", { timeout: 30_000 }),
    onSuccess: (backup) => {
      posthog.capture("backup_requested");
      queryClient.setQueryData(backupKeys.detail(backup.id), backup);
      const next = new URLSearchParams(searchParams);
      next.set("tab", "backups");
      next.set("backup", backup.id);
      setSearchParams(next, { replace: true });
      toast.success(t("organization.backups.requested"));
    },
    onError: (error) => {
      const userFacing = getUserFacingError(error);
      toast.error(t(userFacing.titleKey), {
        description: getUserFacingDescription(userFacing, t),
      });
    },
  });

  const backup = backupQuery.data;
  const isActive = backup?.status === "queued" || backup?.status === "processing";

  const download = async () => {
    if (!canRead || !backup || backup.status !== "ready") return;
    try {
      const result = await api.get<{
        downloadUrl: string;
        expiresAt: string;
        filename: string;
      }>(`/v1/organization/backups/${backup.id}/download-url`);
      downloads.downloadUrl(result.downloadUrl, result.filename);
      posthog.capture("backup_downloaded");
    } catch (error) {
      const userFacing = getUserFacingError(error);
      toast.error(t(userFacing.titleKey), {
        description: getUserFacingDescription(userFacing, t),
      });
    }
  };

  return (
    <div className="space-y-6" data-testid="backups-section">
      <Alert>
        <AlertTitle>{t("organization.backups.cloudOnlyTitle")}</AlertTitle>
        <AlertDescription>
          {t("organization.backups.cloudOnlyDescription")}
        </AlertDescription>
      </Alert>

      <section
        aria-labelledby="organization-backup-export-heading"
        className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
      >
        <h2
          className="text-base font-semibold"
          id="organization-backup-export-heading"
        >
          {t("organization.backups.exportTitle")}
        </h2>
        <div className="max-w-3xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-xl text-sm text-muted-foreground">
              {t("organization.backups.exportDescription")}
            </p>
            {canCreate && !backup && !backupQuery.isLoading && (
              <Button
                className="h-11 w-full shrink-0 sm:h-8 sm:w-auto"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending
                  ? t("organization.backups.requesting")
                  : t("organization.backups.create")}
              </Button>
            )}
          </div>

        {backupQuery.isLoading && (
          <p
            aria-live="polite"
            className="mt-5 text-sm text-muted-foreground"
            role="status"
          >
            {t("organization.backups.loading")}
          </p>
        )}

        {backupQuery.isError && (
          <div className="mt-5 flex items-center justify-between gap-4 border-t pt-5">
            <p className="text-sm text-destructive" role="alert">
              {t("organization.backups.loadFailed")}
            </p>
            <Button
              onClick={() => backupQuery.refetch()}
              size="sm"
              variant="outline"
            >
              {t("common.retry")}
            </Button>
          </div>
        )}

        {isActive && backup && (
          <BackupProgress backup={backup} />
        )}

        {backup?.status === "ready" && (
          <div className="mt-5 flex flex-col gap-4 border-t border-primary/20 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div aria-live="polite" className="space-y-1" role="status">
              <p className="text-sm font-medium">
                {t("organization.backups.ready")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("organization.backups.readyDescription", {
                  expiresAt: formatDate(backup.expiresAt),
                  size: formatBytes(backup.archiveSizeBytes),
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("organization.backups.emailSent")}
              </p>
            </div>
            <Button onClick={download}>{t("organization.backups.download")}</Button>
          </div>
        )}

        {canCreate &&
          (backup?.status === "failed" || backup?.status === "expired") && (
          <div className="mt-5 flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="space-y-1"
              role={backup.status === "failed" ? "alert" : "status"}
            >
              <p className="text-sm font-medium">
                {backup.status === "failed"
                  ? t("organization.backups.failed")
                  : t("organization.backups.expired")}
              </p>
              <p className="text-sm text-muted-foreground">
                {backup.status === "failed"
                  ? t("organization.backups.failedDescription")
                  : t("organization.backups.expiredDescription")}
              </p>
            </div>
            <Button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              variant="outline"
            >
              {t("organization.backups.tryAgain")}
            </Button>
          </div>
        )}
        </div>
      </section>
    </div>
  );
}

function BackupProgress({ backup }: { backup: OrganizationBackup }) {
  const { t } = useTranslation();
  const percentage =
    backup.progress.totalBytes && backup.progress.totalBytes > 0
      ? Math.min(
          100,
          (backup.progress.processedBytes / backup.progress.totalBytes) * 100,
        )
      : undefined;

  return (
    <div className="mt-5 space-y-3 border-t pt-5">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-medium">
          {t(`organization.backups.phase.${backup.phase}`)}
        </span>
        {backup.progress.totalFiles !== null && (
          <span className="text-muted-foreground">
            {t("organization.backups.fileProgress", {
              completed: backup.progress.processedFiles,
              total: backup.progress.totalFiles,
            })}
          </span>
        )}
      </div>
      <Progress
        aria-label={t(`organization.backups.phase.${backup.phase}`)}
        value={percentage ?? null}
      />
      <p className="text-xs text-muted-foreground">
        {t("organization.backups.emailWhenReady")}
      </p>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return DATE_FORMATTER.format(new Date(value));
}

function formatBytes(value: number | null) {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${NUMBER_FORMATTER.format(size)} ${unit}`;
}
