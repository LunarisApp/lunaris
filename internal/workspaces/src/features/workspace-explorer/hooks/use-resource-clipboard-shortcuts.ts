import type { TreeInstance } from "@lunarisapp/ui/components/tree";
import { useResourceTypes } from "@lunarisapp/plugin-sdk";
import { permission } from "@repo/auth/permissions";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import type { UseHotkeyOptions } from "@tanstack/react-hotkeys";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getResourceCapacityErrorMessageKey } from "@repo/features/entitlements";
import {
  createHotkeyOptions,
  HOTKEYS,
  useResolvedHotkeyBinding,
} from "@repo/features/hotkeys";
import { usePermission } from "@repo/features/permissions";
import { useWorkspaceActions } from "../store";
import { isFolder, supportsResourceDuplication } from "../types";

const COPY_HOTKEY = HOTKEYS["copy-resources"];
const PASTE_HOTKEY = HOTKEYS["paste-resources"];

interface UseResourceClipboardShortcutsOptions {
  target: UseHotkeyOptions["target"];
  tree: TreeInstance<WorkspaceResourceEntity>;
}

export function useResourceClipboardShortcuts({
  target,
  tree,
}: UseResourceClipboardShortcutsOptions) {
  const { t } = useTranslation();
  const { duplicateResource } = useWorkspaceActions();
  const resourceTypes = useResourceTypes();
  const duplicatableResourceTypes = useMemo(
    () =>
      new Set(
        resourceTypes
          .filter(supportsResourceDuplication)
          .map((resource) => resource.resourceTypeId)
      ),
    [resourceTypes]
  );
  const canCreate = usePermission(permission.content.write);
  const copiedResourceIds = useRef<string[]>([]);

  const copy = useCallback(() => {
    copiedResourceIds.current = tree
      .getSelectedItems()
      .filter((item) => {
        const data = item.getItemData();
        return (
          !isFolder(data) &&
          duplicatableResourceTypes.has(data.resource_type_id ?? "")
        );
      })
      .map((item) => item.getId());
  }, [duplicatableResourceTypes, tree]);

  const paste = useCallback(async () => {
    if (!canCreate) {
      return;
    }
    for (const resourceId of copiedResourceIds.current) {
      try {
        await duplicateResource(resourceId, {
          copyLabel: t("common.copy"),
          trigger: "clipboard",
          untitledLabel: t("common.untitled"),
        });
      } catch (error) {
        toast.error(
          t(
            getResourceCapacityErrorMessageKey(
              error,
              "explorer.failedToCreateResource"
            )
          )
        );
      }
    }
  }, [canCreate, duplicateResource, t]);

  const options = {
    ignoreInputs: true,
    preventDefault: true,
    target,
  };

  useHotkey(
    useResolvedHotkeyBinding(COPY_HOTKEY),
    copy,
    createHotkeyOptions(COPY_HOTKEY, t, options)
  );
  useHotkey(
    useResolvedHotkeyBinding(PASTE_HOTKEY),
    paste,
    createHotkeyOptions(PASTE_HOTKEY, t, options)
  );
}
