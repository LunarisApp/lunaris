"use client";

import { Button } from "@lunarisapp/ui/components/button";
import { Kbd } from "@lunarisapp/ui/components/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import { HugeiconsIcon, PlusSignIcon } from "@lunarisapp/ui/icons";
import { useHotkeyDisplay } from "@repo/features/hotkeys";
import type { IDockviewHeaderActionsProps } from "dockview";
import { useTranslation } from "react-i18next";
import { useGridLayoutStore } from "../context";
import { createEmptyPanelDefinition } from "../empty-panel";

export function GridLayoutGroupControls({
  group,
}: IDockviewHeaderActionsProps) {
  const { t } = useTranslation();
  const addPanel = useGridLayoutStore((state) => state.addPanel);
  const newTabShortcut = useHotkeyDisplay("new-tab");

  const handleAddPanel = () => {
    addPanel(
      createEmptyPanelDefinition({
        allowDuplicate: true,
        groupId: group.id,
        title: t("gridLayout.emptyPanel.title"),
      })
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={t("gridLayout.emptyPanel.add")}
            onClick={handleAddPanel}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <HugeiconsIcon icon={PlusSignIcon} />
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-3">
        <span>{t("gridLayout.emptyPanel.add")}</span>
        <Kbd>{newTabShortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
