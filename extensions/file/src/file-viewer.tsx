import {
  type ResourceStorageHandle,
  ViewReady,
  useStoredFile,
} from "@lunarisapp/plugin-sdk";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { preloadFileRenderer, renderFilePreview } from "./file-renderers";

export function FileViewer({
  storage,
  reportReady,
}: {
  storage: ResourceStorageHandle;
  reportReady?: () => void;
}) {
  const { t } = useTranslation();
  const { file, metadata, objectUrl } = useStoredFile(storage);

  useEffect(() => {
    if (metadata) void preloadFileRenderer(metadata).catch(() => undefined);
  }, [metadata]);

  const title = metadata?.filename ?? "File";
  const statusText = useMemo(() => {
    if (!metadata) return t("fileExtension.file.missingMetadata");
    if (!file) return t("fileExtension.file.downloadPending");
    if (file.status === "queued-download") {
      return t("fileExtension.file.downloadPending");
    }
    if (
      file.status === "synced" &&
      file.hasSynced &&
      !file.localUri
    ) {
      return t("fileExtension.file.downloadPending");
    }
    if (!objectUrl) {
      return t("fileExtension.file.downloadFailed");
    }
    return null;
  }, [file, metadata, objectUrl, t]);

  if (statusText) {
    return (
      <ViewReady reportReady={reportReady}>
        <div className="flex h-full items-center justify-center p-6">
          <PanelError description={title} title={statusText} variant="error" />
        </div>
      </ViewReady>
    );
  }

  if (!objectUrl || !metadata) return null;

  return <>{renderFilePreview({ metadata, objectUrl, reportReady })}</>;
}
