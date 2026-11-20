import { FEATURE } from "@repo/auth/entitlements";
import { useFeatureAccess } from "@repo/features/entitlements";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import { AiChat02Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { useOrganizationNavigation } from "@repo/workspaces/organization-navigation";
import { useTranslation } from "react-i18next";
import { AGENT_WORK_TOOL_ID } from "./constants";

export function AgentWorkLauncher({ tooltip = false }: { tooltip?: boolean }) {
  const { openTool } = useOrganizationNavigation();
  const { t } = useTranslation();
  const { allowed, pending } = useFeatureAccess(FEATURE.agentWork);
  if (pending || !allowed) {
    return null;
  }
  const label = t(tooltip ? "editor.agentWorkMini" : "editor.agentWork");
  const button = (
    <Button
      size="icon"
      variant="ghost"
      title={tooltip ? undefined : label}
      aria-label={label}
      onClick={() =>
        openTool({
          toolId: AGENT_WORK_TOOL_ID,
          target: { direction: "right" },
        })
      }
    >
      <HugeiconsIcon aria-hidden="true" icon={AiChat02Icon} />
    </Button>
  );
  return tooltip ? (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  ) : (
    button
  );
}
