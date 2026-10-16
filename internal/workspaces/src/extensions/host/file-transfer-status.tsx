import { Progress } from "@lunarisapp/ui/components/progress";
import { Button } from "@lunarisapp/ui/components/button";
import { usePowerSync } from "@repo/data/core";
import {
  getFileTransferStates,
  retryFileTransfers,
  subscribeFileTransfers,
} from "@repo/data/features/attachments";
import { formatStorageBytes } from "@repo/auth/storage";
import { log, parseError } from "evlog";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** Only the current workspace's local transfer state is displayed. */
export function FileTransferStatus({ workspaceId }: { workspaceId: string }) {
  const db = usePowerSync();
  const [transfers, setTransfers] = useState<
    Awaited<ReturnType<typeof getFileTransferStates>>
  >([]);
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void getFileTransferStates(db, workspaceId)
        .then((rows) => {
          if (mounted) {
            setTransfers(rows);
          }
        })
        .catch((error) => {
          log.warn({
            context: "FileTransferStatus",
            message: "Could not read local transfer state",
            error: parseError(error),
          });
        });
    };
    refresh();
    const unsubscribe = subscribeFileTransfers(workspaceId, refresh);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [db, workspaceId]);
  return (
    <FileTransferStatusView
      transfers={transfers}
      onRetry={() => retryFileTransfers(db, workspaceId)}
    />
  );
}

export function FileTransferStatusView({
  transfers,
  onRetry,
}: {
  transfers: Awaited<ReturnType<typeof getFileTransferStates>>;
  onRetry: () => Promise<void>;
}) {
  const { t } = useTranslation();
  if (!transfers.length) {
    return null;
  }
  const blocked = transfers.filter((transfer) => transfer.state === "blocked");
  const active = transfers.filter((transfer) => transfer.state === "uploading");
  const uploaded = active.reduce(
    (sum, transfer) => sum + transfer.uploadedBytes,
    0
  );
  const total = active.reduce((sum, transfer) => sum + transfer.totalBytes, 0);
  return (
    <div className="border-b bg-background px-4 py-2 text-sm" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          {blocked.length
            ? t("organization.billing.uploadBlocked")
            : t("organization.billing.uploadProgress", {
                uploaded: formatStorageBytes(uploaded),
                total: formatStorageBytes(total),
              })}
        </p>
        {blocked.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => void onRetry()}>
            {t("organization.billing.retry")}
          </Button>
        )}
      </div>
      {blocked.length > 0 && (
        <ul className="space-y-1 text-muted-foreground">
          {blocked.map((transfer) => (
            <li key={transfer.fileId} className="break-words">
              {transfer.filename}: {transfer.error}
            </li>
          ))}
        </ul>
      )}
      {active.length > 0 && (
        <>
          {blocked.length > 0 && (
            <p>
              {t("organization.billing.uploadProgress", {
                uploaded: formatStorageBytes(uploaded),
                total: formatStorageBytes(total),
              })}
            </p>
          )}
          <Progress
            className="w-full"
            aria-label={t("organization.billing.storageTitle")}
            value={uploaded}
            max={Math.max(total, 1)}
          />
        </>
      )}
    </div>
  );
}
