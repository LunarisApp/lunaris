import { Button } from "@lunarisapp/ui/components/button";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import { HugeiconsIcon, WifiError01Icon } from "@lunarisapp/ui/icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

interface WorkspaceUnavailableOfflineProps {
  backTo: string;
}

export function WorkspaceUnavailableOffline({
  backTo,
}: WorkspaceUnavailableOfflineProps) {
  const { t } = useTranslation();

  return (
    <PanelError
      actions={
        <Button nativeButton={false} render={<Link to={backTo} />} variant="outline">
          {t("editor.backToWorkspaces")}
        </Button>
      }
      data-testid="workspace-unavailable-offline"
      description={t("editor.offlineUnavailableDescription")}
      icon={<HugeiconsIcon icon={WifiError01Icon} strokeWidth={2} />}
      title={t("editor.offlineUnavailableTitle")}
    />
  );
}
