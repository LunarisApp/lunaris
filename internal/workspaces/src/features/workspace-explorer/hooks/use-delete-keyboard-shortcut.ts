import type { TreeInstance } from "@lunarisapp/ui/components/tree";
import { permission } from "@repo/auth/permissions";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import type { UseHotkeyOptions } from "@tanstack/react-hotkeys";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { createHotkeyOptions, HOTKEYS, useResolvedHotkeyBinding } from "@repo/features/hotkeys";
import { usePermission } from "@repo/features/permissions";
import { useWorkspaceActions } from "../store";
import { type DeleteTarget, toDeleteTargetName } from "../utils";

export type { DeleteTarget };

interface CanTriggerDeleteShortcutOptions {
  activeElement: Element | null;
  confirmDeleteOpen: boolean;
  treeElement: HTMLElement | null;
}

interface UseDeleteKeyboardShortcutOptions {
  target: UseHotkeyOptions["target"];
  tree: TreeInstance<WorkspaceResourceEntity>;
}

interface DeleteKeyboardShortcutState {
  confirmDeleteOpen: boolean;
  handleConfirmDelete: () => void;
  itemsToDelete: DeleteTarget[];
  setConfirmDeleteOpen: (open: boolean) => void;
}

export function canTriggerDeleteShortcut({
  activeElement,
  confirmDeleteOpen,
  treeElement,
}: CanTriggerDeleteShortcutOptions): boolean {
  if (confirmDeleteOpen) return false;
  if (!treeElement) return false;
  if (!activeElement) return false;

  return treeElement.contains(activeElement);
}

/**
 * Hook that handles Cmd+Backspace (Mac) / Delete (Win/Linux) for the tree
 * region only, so delete works when the sidebar tree has focus and stays
 * inactive everywhere else.
 */
export function useDeleteKeyboardShortcut({
  target,
  tree,
}: UseDeleteKeyboardShortcutOptions): DeleteKeyboardShortcutState {
  const { t } = useTranslation();
  const { deleteResources } = useWorkspaceActions();
  const canDelete = usePermission(permission.content.delete);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState<DeleteTarget[]>([]);
  const hotkey = HOTKEYS["delete-resource"];

  const handleDelete = useCallback(() => {
    if (!canDelete) return;
    if (
      !canTriggerDeleteShortcut({
        activeElement: document.activeElement,
        confirmDeleteOpen,
        treeElement: tree.getElement() ?? null,
      })
    ) {
      return;
    }

    const selectedItems = tree.getSelectedItems();
    if (selectedItems.length === 0) return;

    const targets: DeleteTarget[] = selectedItems.map((instance) => ({
      id: instance.getId(),
      name: toDeleteTargetName(instance.getItemName()),
    }));

    setItemsToDelete(targets);
    setConfirmDeleteOpen(true);
  }, [canDelete, confirmDeleteOpen, tree]);

  const handleConfirmDelete = useCallback(async () => {
    if (!canDelete || itemsToDelete.length === 0) return;
    const ids = itemsToDelete.map((t) => t.id);
    setConfirmDeleteOpen(false);
    setItemsToDelete([]);
    await deleteResources(ids);
  }, [canDelete, itemsToDelete, deleteResources]);

  useHotkey(
    useResolvedHotkeyBinding(hotkey),
    handleDelete,
    createHotkeyOptions(hotkey, t, {
      ignoreInputs: true,
      target,
    })
  );

  return {
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    itemsToDelete,
    handleConfirmDelete,
  };
}
