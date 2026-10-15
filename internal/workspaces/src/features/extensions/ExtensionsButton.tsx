"use client";

import { Button } from "@lunarisapp/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import { BlockGameIcon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useOrganizationNavigation } from "../organization-navigation";

export function ExtensionsButton() {
  const { t } = useTranslation();
  const { openTool } = useOrganizationNavigation();

  const handleClick = useCallback(() => {
    openTool({ toolId: "extensions" });
  }, [openTool]);

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
        <HugeiconsIcon icon={BlockGameIcon} />
        <span className="sr-only">{t("commands.extensions")}</span>
      </TooltipTrigger>
      <TooltipContent>{t("commands.extensions")}</TooltipContent>
    </Tooltip>
  );
}
