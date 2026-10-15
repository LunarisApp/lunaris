"use client";

import { Button } from "@lunarisapp/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import { HugeiconsIcon, Settings01Icon } from "@lunarisapp/ui/icons";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useOrganizationNavigation } from "../organization-navigation";
import { WORKSPACE_SETTINGS_TOOL_ID } from "../organization-navigation/tool-registry";

export function WorkspaceSettingsButton() {
  const { t } = useTranslation();
  const { openTool } = useOrganizationNavigation();
  const openWorkspaceSettings = useCallback(() => {
    openTool({ toolId: WORKSPACE_SETTINGS_TOOL_ID });
  }, [openTool]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={t("common.settings")}
            className="text-muted-foreground hover:text-foreground"
            data-testid="workspace-settings-trigger"
            onClick={openWorkspaceSettings}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <HugeiconsIcon icon={Settings01Icon} />
      </TooltipTrigger>
      <TooltipContent>{t("common.settings")}</TooltipContent>
    </Tooltip>
  );
}
