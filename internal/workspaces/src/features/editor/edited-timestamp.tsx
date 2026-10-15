import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import { useWorkspaceResourceTimestamps } from "@repo/data/features/workspace-resources";
import { useStorageSlot } from "@repo/data/features/workspace-storage-slots";
import {
  useDocumentCreatedAt,
  useDocumentLastEdited,
} from "@repo/data/features/yjs";
import { formatAbsoluteTime, formatRelativeTime } from "@repo/utils";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@repo/features/locale";

interface EditedTimestampProps {
  className?: string;
  resourceId?: string;
  storageId: string;
}

/**
 * Displays when a document was last edited or created.
 * Shows relative time with absolute time in tooltip on hover.
 * Updates every minute for accuracy.
 */
export function EditedTimestamp({
  resourceId,
  storageId,
  className,
}: EditedTimestampProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const slot = useStorageSlot(storageId).data[0];
  const documentId = slot?.kind === "yjs" ? slot.backing_id ?? "" : "";
  const { lastEditedAt, isLoading: isEditLoading } =
    useDocumentLastEdited(documentId);
  const { createdAt, isLoading: isCreateLoading } =
    useDocumentCreatedAt(documentId);
  const {
    createdAt: itemCreatedAt,
    updatedAt: itemUpdatedAt,
    isLoading: isItemLoading,
  } = useWorkspaceResourceTimestamps(resourceId);

  // Force re-render every minute for relative time accuracy
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((tick) => tick + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const isLoading = isEditLoading || isCreateLoading || isItemLoading;
  const creationTimestamp = itemCreatedAt ?? createdAt;
  const latestEdit = [lastEditedAt, itemUpdatedAt]
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const hasEdits = Boolean(
    latestEdit &&
      creationTimestamp &&
      latestEdit.getTime() > creationTimestamp.getTime()
  );
  const timestamp = hasEdits ? latestEdit : creationTimestamp;
  const prefix = hasEdits ? t("editor.edited") : t("editor.created");

  if (isLoading || !timestamp) {
    return null;
  }

  const relativeTime = formatRelativeTime(timestamp, locale, t);
  const absoluteTime = formatAbsoluteTime(timestamp, locale, t);

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={className} />}>
        {prefix} {relativeTime}
      </TooltipTrigger>
      <TooltipContent>{absoluteTime}</TooltipContent>
    </Tooltip>
  );
}
