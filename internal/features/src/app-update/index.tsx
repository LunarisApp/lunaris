import { Button } from "@lunarisapp/ui/components/button";
import { Kbd } from "@lunarisapp/ui/components/kbd";
import { HugeiconsIcon, Refresh01Icon } from "@lunarisapp/ui/icons";
import { formatHotkeyDisplay } from "@repo/features/hotkeys";
import { createContext, type ReactNode, useContext } from "react";
import { useTranslation } from "react-i18next";

export interface AppUpdateState {
  needRefresh: boolean;
  update: () => Promise<void>;
}

const NO_APP_UPDATE: AppUpdateState = {
  needRefresh: false,
  update: async () => {},
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
  const { needRefresh, update } = useAppUpdate();
  if (!needRefresh) return null;
  return (
    <Button
      className={APP_UPDATE_BUTTON_CLASSNAME}
      onClick={() => void update()}
      size={size}
      variant="default"
    >
      <HugeiconsIcon icon={Refresh01Icon} />
      {t("appUpdate.updateNow")}
      <Kbd className="bg-blue-200 text-blue-800 dark:bg-blue-800/50 dark:text-blue-300">
        {formatHotkeyDisplay("Mod+R")}
      </Kbd>
    </Button>
  );
}
