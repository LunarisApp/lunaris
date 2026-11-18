import { Button } from "@lunarisapp/ui/components/button";
import { Kbd } from "@lunarisapp/ui/components/kbd";
import { HugeiconsIcon, Refresh01Icon } from "@lunarisapp/ui/icons";
import { formatHotkeyDisplay } from "@repo/features/hotkeys";
import { createContext, type ReactNode, useContext, useState } from "react";
import { useTranslation } from "react-i18next";

export interface AppUpdateState {
  failed?: boolean;
  needRefresh: boolean;
  phase?: "downloading" | "installing" | "restarting";
  progress?: number;
  requiresRestart?: boolean;
  update: () => Promise<void>;
}

const NO_APP_UPDATE: AppUpdateState = {
  needRefresh: false,
  update: async () => {
    /* No action while this capability is unavailable. */
  },
};

const AppUpdateContext = createContext<AppUpdateState>(NO_APP_UPDATE);

export function AppUpdateProvider({
  children,
  value = NO_APP_UPDATE,
}: {
  children: ReactNode;
  value?: AppUpdateState;
}) {
  return (
    <AppUpdateContext.Provider value={value}>
      {children}
    </AppUpdateContext.Provider>
  );
}

export function useAppUpdate() {
  return useContext(AppUpdateContext);
}

const APP_UPDATE_BUTTON_CLASSNAME =
  "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/40";

export function AppUpdateButton({
  size = "default",
}: {
  size?: "xs" | "default";
}) {
  const { t } = useTranslation();
  const { needRefresh, update, requiresRestart, phase, progress, failed } =
    useAppUpdate();
  const [pending, setPending] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const applyUpdate = async () => {
    setPending(true);
    setActionFailed(false);
    try {
      await update();
    } catch {
      setActionFailed(true);
    } finally {
      setPending(false);
    }
  };
  if (!needRefresh) {
    return null;
  }
  const label = phase
    ? t(`appUpdate.${phase}`)
    : requiresRestart
      ? t("appUpdate.updateAndRestart")
      : t("appUpdate.updateNow");
  const accessibleLabel =
    phase === "downloading" && progress !== undefined
      ? `${label} ${progress}%`
      : label;

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        aria-label={accessibleLabel}
        className={`${APP_UPDATE_BUTTON_CLASSNAME} group/app-update gap-0 transition-colors ${size === "xs" ? "max-h-6 min-h-6 px-[5px]" : "max-h-8 min-h-8 px-[7px]"}`}
        disabled={pending || Boolean(phase)}
        aria-busy={pending || Boolean(phase)}
        onClick={() => void applyUpdate()}
        size={size}
        variant="default"
      >
        <HugeiconsIcon icon={Refresh01Icon} />
        <span
          aria-hidden="true"
          className="grid grid-cols-[0fr] opacity-0 transition-[grid-template-columns,opacity] duration-200 ease-out group-hover/app-update:grid-cols-[1fr] group-hover/app-update:opacity-100 group-focus-visible/app-update:grid-cols-[1fr] group-focus-visible/app-update:opacity-100 group-aria-busy/app-update:grid-cols-[1fr] group-aria-busy/app-update:opacity-100 motion-reduce:transition-none"
        >
          <span className="min-w-0 overflow-hidden">
            <span
              className={`flex items-center ${size === "xs" ? "gap-1 pl-1" : "gap-1.5 pl-1.5"}`}
            >
              <span>{accessibleLabel}</span>
              {!requiresRestart && (
                <Kbd className="bg-blue-200 text-blue-800 dark:bg-blue-800/50 dark:text-blue-300">
                  {formatHotkeyDisplay("Mod+R")}
                </Kbd>
              )}
            </span>
          </span>
        </span>
      </Button>
      {failed || actionFailed ? (
        <span className="text-destructive text-xs" role="alert">
          {t("appUpdate.failed")}
        </span>
      ) : null}
    </div>
  );
}
