"use client";

import { Badge } from "@lunarisapp/ui/components/badge";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import { Delete02Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOrganizationNavigation } from "../../organization-navigation";
import { WORKSPACE_TRASH_TOOL_ID } from "../constants";
import { useWorkspaceTrashMap } from "../store";

export function WorkspaceTrashButton() {
  const { t } = useTranslation();
  const { openTool } = useOrganizationNavigation();
  const trash = useWorkspaceTrashMap();
  const count = useMemo(
    () =>
      [...trash.values()].filter((entry) => entry.id === entry.trash_root_id)
        .length,
    [trash],
  );

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={t("trash.title")}
            className="relative text-muted-foreground hover:text-foreground"
            data-testid="workspace-trash-trigger"
            onClick={() => openTool({ toolId: WORKSPACE_TRASH_TOOL_ID })}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <HugeiconsIcon icon={Delete02Icon} />
        {count > 0 ? (
          <Badge
            aria-label={t("trash.resourceCount", { count })}
            className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px] text-muted-foreground"
            variant="secondary"
          >
            {count > 99 ? "99+" : count}
          </Badge>
        ) : null}
      </TooltipTrigger>
      <TooltipContent>{t("trash.title")}</TooltipContent>
    </Tooltip>
  );
}
