import { FEATURE } from "@repo/auth/entitlements";
import { useFeatureAccess } from "@repo/features/entitlements";
import { Button } from "@lunarisapp/ui/components/button";
import { AiChat02Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { useOrganizationNavigation } from "@repo/workspaces/organization-navigation";
import { useTranslation } from "react-i18next";
import { AGENT_WORK_TOOL_ID } from "./constants";

export function AgentWorkLauncher() {
  const { openTool } = useOrganizationNavigation();
  const { t } = useTranslation();
  const { allowed, pending } = useFeatureAccess(FEATURE.agentWork);
  if (pending || !allowed) {
    return null;
  }
  return (
    <Button
      size="icon"
      variant="ghost"
      title={t("editor.agentWork")}
      aria-label={t("editor.agentWork")}
      onClick={() =>
        openTool({
          toolId: AGENT_WORK_TOOL_ID,
          target: { direction: "right" },
        })
      }
    >
      <HugeiconsIcon icon={AiChat02Icon} />
    </Button>
  );
}
