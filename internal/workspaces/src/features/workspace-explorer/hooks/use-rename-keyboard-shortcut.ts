import type { TreeInstance } from "@lunarisapp/ui/components/tree";
import { permission } from "@repo/auth/permissions";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import type { UseHotkeyOptions } from "@tanstack/react-hotkeys";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createHotkeyOptions, HOTKEYS, useResolvedHotkeyBinding } from "@repo/features/hotkeys";
import { usePermission } from "@repo/features/permissions";

interface UseRenameKeyboardShortcutOptions {
  target: UseHotkeyOptions["target"];
  tree: TreeInstance<WorkspaceResourceEntity>;
}

/**
 * Hook that handles F2 for the focused tree region. Active editor panels still
 * rely on the grid layout's capture-phase rename handler instead.
 */
export function useRenameKeyboardShortcut({
  target,
  tree,
}: UseRenameKeyboardShortcutOptions) {
  const { t } = useTranslation();
  const hotkey = HOTKEYS["rename-resource"];
  const canUpdate = usePermission(permission.content.write);

  const handleRename = useCallback(() => {
    if (!canUpdate) return;
    const selectedItems = tree.getSelectedItems();
    if (selectedItems.length !== 1) return;

    const selectedItem = selectedItems[0];
    if (!selectedItem) return;

    selectedItem.startRenaming();
  }, [canUpdate, tree]);

  useHotkey(
    useResolvedHotkeyBinding(hotkey),
    handleRename,
    createHotkeyOptions(hotkey, t, { target })
  );
}
