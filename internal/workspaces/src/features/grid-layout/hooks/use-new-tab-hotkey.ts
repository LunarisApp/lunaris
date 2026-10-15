import {
  createHotkeyOptions,
  HOTKEYS,
  useResolvedHotkeyBinding,
} from "@repo/features/hotkeys";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useGridLayoutStore } from "../context";
import { createEmptyPanelDefinition } from "../empty-panel";
import { MAIN_GROUP_ID } from "../types";

export function useNewTabHotkey() {
  const { t } = useTranslation();
  const addGroup = useGridLayoutStore((state) => state.addGroup);
  const addPanel = useGridLayoutStore((state) => state.addPanel);
  const dockviewApi = useGridLayoutStore((state) => state.dockviewApi);
  const groups = useGridLayoutStore((state) => state.groups);
  const hotkey = HOTKEYS["new-tab"];

  const openNewTab = useCallback(() => {
    const activeGroupId =
      dockviewApi?.activeGroup?.id ??
      groups[0]?.id ??
      addGroup({ id: MAIN_GROUP_ID, direction: "right" }).id;

    addPanel(
      createEmptyPanelDefinition({
        allowDuplicate: true,
        groupId: activeGroupId,
        title: t("gridLayout.emptyPanel.title"),
      })
    );
  }, [addGroup, addPanel, dockviewApi, groups, t]);

  useHotkey(
    useResolvedHotkeyBinding(hotkey),
    openNewTab,
    createHotkeyOptions(hotkey, t, {
      enabled: Boolean(dockviewApi),
      preventDefault: true,
    })
  );
}
