"use client";

import { Button } from "@lunarisapp/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import { HugeiconsIcon, SidebarLeftIcon } from "@lunarisapp/ui/icons";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useOrganizationNavigation,
  useOrganizationViewState,
} from "../../organization-navigation";

/**
 * Toggle button for the workspace explorer panel.
 * Hidden when the panel is already open.
 */
export function WorkspaceExplorerButton() {
  const { t } = useTranslation();
  const { openExplorer } = useOrganizationNavigation();
  const { isExplorerOpen } = useOrganizationViewState();

  const isOpen = isExplorerOpen;

  const handleClick = useCallback(() => {
    openExplorer();
  }, [openExplorer]);

  if (isOpen) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className="text-muted-foreground hover:text-foreground"
            onClick={handleClick}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <HugeiconsIcon icon={SidebarLeftIcon} />
        <span className="sr-only">{t("explorer.title")}</span>
      </TooltipTrigger>
      <TooltipContent>{t("explorer.title")}</TooltipContent>
    </Tooltip>
  );
}
