import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@lunarisapp/ui/components/context-menu";
import {
  DockviewDefaultTab,
  type IDockviewPanelHeaderProps,
} from "dockview-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHotkeyDisplay } from "@repo/features/hotkeys";
import { useGridLayoutStore } from "../context";

export function GridLayoutTab(props: IDockviewPanelHeaderProps) {
  const { t } = useTranslation();
  const { api, containerApi } = props;
  const movePanelToWindow = useGridLayoutStore(
    (state) => state.movePanelToWindow
  );
  const isMoving = useGridLayoutStore((state) =>
    state.movingPanelIds.has(api.id)
  );
  const moveToNewWindowShortcut = useHotkeyDisplay(
    "move-panel-to-new-window"
  );
  const closeShortcut = useHotkeyDisplay("close-tab");
  const [siblingCount, setSiblingCount] = useState(api.group.panels.length);

  useEffect(() => {
    const update = () => setSiblingCount(api.group.panels.length);
    update();
    const disposables = [
      containerApi.onDidAddPanel(update),
      containerApi.onDidRemovePanel(update),
      api.onDidGroupChange(update),
    ];
    return () => {
      for (const d of disposables) d.dispose();
    };
  }, [api, containerApi]);

  const onlyTab = siblingCount <= 1;

  const closeSelf = () => api.close();
  const closeOthers = () => {
    api.setActive();
    for (const p of [...api.group.panels]) {
      if (p.id !== api.id) p.api.close();
    }
  };
  const closeAll = () => {
    for (const p of [...api.group.panels]) p.api.close();
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<DockviewDefaultTab {...props} />} />
      <ContextMenuContent>
        <ContextMenuItem
          disabled={isMoving}
          onClick={() => void movePanelToWindow(api.id)}
        >
          {t("gridLayout.tab.moveToNewWindow")}
          <ContextMenuShortcut>{moveToNewWindowShortcut}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={closeSelf}>
          {t("gridLayout.tab.close")}
          <ContextMenuShortcut>{closeShortcut}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={onlyTab} onClick={closeOthers}>
          {t("gridLayout.tab.closeOthers")}
        </ContextMenuItem>
        <ContextMenuItem onClick={closeAll}>
          {t("gridLayout.tab.closeAll")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
