"use client";

import { ConfirmationDialog } from "@lunarisapp/ui/blocks/confirmation-dialog";
import { Button } from "@lunarisapp/ui/components/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@lunarisapp/ui/components/hover-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@lunarisapp/ui/components/popover";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import {
  Alert02Icon,
  CloudOffIcon,
  HugeiconsIcon,
  type IconSvgObject,
  LockIcon,
} from "@lunarisapp/ui/icons";
import { cn } from "@lunarisapp/ui/lib/utils";
import {
  clearUploadQueue,
  usePowerSync,
  useSyncAccess,
  useSyncBlocker,
  useSyncBlockerState,
} from "@repo/data/core";
import { useStatus } from "@repo/data/features/sync-status";
import { useOnlineStatus } from "@repo/platform";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/context";
import { resolveSyncStatus, type SyncStatusDescriptor } from "./resolve-status";

export {
  resolveSyncStatus,
  type SyncStatusDescriptor,
} from "./resolve-status";
export {
  type StableLoadingState,
  useStableInitialLoading,
} from "./use-stable-initial-loading";

/**
 * HoverCard on desktop, Popover (click) on mobile.
 */
function ResponsiveCard({
  content,
  trigger,
}: {
  content: ReactNode;
  trigger: React.ReactElement;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Popover>
        <PopoverTrigger render={trigger} />
        <PopoverContent className="w-[min(20rem,calc(100vw-2rem))]">
          {content}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <HoverCard>
      <HoverCardTrigger delay={200} render={trigger} />
      <HoverCardContent className="w-[min(20rem,calc(100vw-2rem))]">
        {content}
      </HoverCardContent>
    </HoverCard>
  );
}

export default function SyncStatusIndicator() {
  const syncAccess = useSyncAccess();
  const { blocked, lastClientErrorStatus } = useSyncBlockerState();
  const status = useStatus();
  const networkOnline = useOnlineStatus();

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

  return (
    <div aria-atomic="true" aria-live="polite" className="flex items-center">
      <SyncStatusContent descriptor={descriptor} />
    </div>
  );
}

function SyncStatusContent({
  descriptor,
}: {
  descriptor: SyncStatusDescriptor;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: activeOrganization } = auth.useActiveOrganization();

  switch (descriptor.kind) {
    case "online":
      return <span className="sr-only">{t("syncStatus.onlineStatus")}</span>;
    case "connecting":
      return null;
    case "offline":
      return (
        <SimpleStatusCard
          icon={CloudOffIcon}
          lastSyncedAt={descriptor.lastSyncedAt}
          message={t("syncStatus.offlineMessage")}
          srLabel={t("syncStatus.offlineStatus")}
          title={t("syncStatus.offlineMode")}
          tone="danger"
        />
      );
    case "local-only-anonymous":
      return (
        <InlineActionStatus
          icon={CloudOffIcon}
          label={t("syncStatus.localOnlyAnonymousAction")}
          onClick={() => void navigate("/auth/register")}
          srLabel={t("syncStatus.localOnlyAnonymousStatus")}
          tone="warning"
        />
      );
    case "blocked-auth":
      return (
        <BlockedStatusCard
          icon={LockIcon}
          lastSyncedAt={descriptor.lastSyncedAt}
          message={t("syncStatus.blockedAuthMessage")}
          primaryAction={{
            label: t("syncStatus.blockedAuthAction"),
            onClick: () => void navigate("/auth"),
          }}
          srLabel={t("syncStatus.blockedAuthStatus")}
          title={t("syncStatus.blockedAuthMode")}
          tone="danger"
        />
      );
    case "blocked-permission":
      return (
        <BlockedStatusCard
          icon={LockIcon}
          lastSyncedAt={descriptor.lastSyncedAt}
          message={t("syncStatus.blockedPermissionMessage")}
          primaryAction={{
            label: t("syncStatus.blockedPermissionAction"),
            onClick: () =>
              void navigate(
                activeOrganization
                  ? `/${activeOrganization.slug}/settings?tab=billing`
                  : "/"
              ),
          }}
          srLabel={t("syncStatus.blockedPermissionStatus")}
          title={t("syncStatus.blockedPermissionMode")}
          tone="warning"
        />
      );
    case "blocked-generic":
      return (
        <BlockedStatusCard
          icon={CloudOffIcon}
          lastSyncedAt={descriptor.lastSyncedAt}
          message={t("syncStatus.blockedMessage")}
          srLabel={t("syncStatus.blockedStatus")}
          title={t("syncStatus.blockedMode")}
          tone="warning"
        />
      );
    case "transient-error":
      return (
        <TransientErrorCard
          lastSyncedAt={descriptor.lastSyncedAt}
          reason={descriptor.reason}
        />
      );
    default: {
      // exhaustiveness check
      const _exhaustive: never = descriptor;
      return _exhaustive;
    }
  }
}

const TONE_CLASSES = {
  warning:
    "text-amber-700 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300",
  danger: "text-destructive hover:text-destructive/80",
} as const;

type Tone = keyof typeof TONE_CLASSES;

interface ActionDescriptor {
  label: string;
  onClick: () => void;
}

export function StatusTrigger({
  icon,
  srLabel,
  tone,
  className,
  ...rest
}: {
  icon: IconSvgObject;
  srLabel: string;
  tone: Tone;
} & Omit<ComponentProps<typeof Button>, "size" | "variant" | "children">) {
  return (
    <Button
      {...rest}
      className={cn(
        "transition-colors duration-200",
        TONE_CLASSES[tone],
        className
      )}
      size="icon-sm"
      variant="link"
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} />
      <span className="sr-only">{srLabel}</span>
    </Button>
  );
}

function InlineActionStatus({
  icon,
  label,
  onClick,
  srLabel,
  tone,
}: {
  icon: IconSvgObject;
  label: string;
  onClick: () => void;
  srLabel: string;
  tone: Tone;
}) {
  return (
    <Button
      aria-label={srLabel}
      className={cn(
        "h-7 gap-1 px-2 font-medium text-xs transition-colors duration-200",
        TONE_CLASSES[tone]
      )}
      onClick={onClick}
      size="sm"
      variant="ghost"
    >
      <HugeiconsIcon className="h-3.5 w-3.5" icon={icon} strokeWidth={2} />
      <span>{label}</span>
    </Button>
  );
}

function LastSyncedLine({ lastSyncedAt }: { lastSyncedAt: Date | undefined }) {
  const { t } = useTranslation();
  if (!lastSyncedAt) {
    return null;
  }

  return (
    <p className="text-xs tabular-nums">
      {t("syncStatus.lastSynced", {
        date: lastSyncedAt.toLocaleString(),
      })}
    </p>
  );
}

function SimpleStatusCard({
  action,
  icon,
  lastSyncedAt,
  message,
  srLabel,
  title,
  tone,
}: {
  action?: ActionDescriptor;
  icon: IconSvgObject;
  lastSyncedAt?: Date;
  message: string;
  srLabel: string;
  title: string;
  tone: Tone;
}) {
  return (
    <ResponsiveCard
      content={
        <div className="space-y-3">
          <h2 className="font-semibold text-lg leading-snug">{title}</h2>
          <div className="space-y-2 text-muted-foreground text-sm">
            <p>{message}</p>
            {lastSyncedAt !== undefined && (
              <LastSyncedLine lastSyncedAt={lastSyncedAt} />
            )}
          </div>
          {!!action && (
            <div className="flex gap-2 pt-1">
              <Button onClick={action.onClick} size="sm">
                {action.label}
              </Button>
            </div>
          )}
        </div>
      }
      trigger={<StatusTrigger icon={icon} srLabel={srLabel} tone={tone} />}
    />
  );
}

function BlockedStatusCard({
  icon,
  lastSyncedAt,
  message,
  primaryAction,
  srLabel,
  title,
  tone,
}: {
  icon: IconSvgObject;
  lastSyncedAt: Date | undefined;
  message: string;
  primaryAction?: ActionDescriptor;
  srLabel: string;
  title: string;
  tone: Tone;
}) {
  const { t } = useTranslation();
  const db = usePowerSync();
  const blocker = useSyncBlocker();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const handleTryAgain = () => {
    blocker.resume();
  };

  const handleClearQueue = async () => {
    await clearUploadQueue(db);
    blocker.resume();
    setConfirmClearOpen(false);
  };

  return (
    <>
      <ResponsiveCard
        content={
          <div className="space-y-3">
            <h2 className="font-semibold text-lg leading-snug">{title}</h2>
            <div className="space-y-2 text-muted-foreground text-sm">
              <p>{message}</p>
              <LastSyncedLine lastSyncedAt={lastSyncedAt} />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {!!primaryAction && (
                <Button onClick={primaryAction.onClick} size="sm">
                  {primaryAction.label}
                </Button>
              )}
              <Button onClick={handleTryAgain} size="sm" variant="secondary">
                {t("settings.local-data.tryAgain")}
              </Button>
              <Button
                onClick={() => setConfirmClearOpen(true)}
                size="sm"
                variant="destructive"
              >
                {t("settings.local-data.clearQueue")}
              </Button>
            </div>
          </div>
        }
        trigger={<StatusTrigger icon={icon} srLabel={srLabel} tone={tone} />}
      />
      <ConfirmationDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("settings.local-data.clearQueue")}
        confirmVariant="destructive"
        description={t("settings.local-data.clearQueueConfirmDescription")}
        onConfirm={() => {
          void handleClearQueue();
        }}
        onOpenChange={setConfirmClearOpen}
        open={confirmClearOpen}
        title={t("settings.local-data.clearQueueConfirmTitle")}
      />
    </>
  );
}

function TransientErrorCard({
  lastSyncedAt,
  reason,
}: {
  lastSyncedAt: Date | undefined;
  reason: string | undefined;
}) {
  const { t } = useTranslation();
  const blocker = useSyncBlocker();

  return (
    <ResponsiveCard
      content={
        <div className="space-y-3">
          <h2 className="font-semibold text-lg leading-snug">
            {t("syncStatus.transientErrorMode")}
          </h2>
          <div className="space-y-2 text-muted-foreground text-sm">
            <p>{t("syncStatus.transientErrorMessage")}</p>
            {!!reason && (
              <p className="break-words text-xs">
                {t("syncStatus.transientErrorReason", { reason })}
              </p>
            )}
            <LastSyncedLine lastSyncedAt={lastSyncedAt} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              onClick={() => blocker.resume()}
              size="sm"
              variant="secondary"
            >
              {t("settings.local-data.tryAgain")}
            </Button>
          </div>
        </div>
      }
      trigger={
        <StatusTrigger
          icon={Alert02Icon}
          srLabel={t("syncStatus.transientErrorStatus")}
          tone="warning"
        />
      }
    />
  );
}
