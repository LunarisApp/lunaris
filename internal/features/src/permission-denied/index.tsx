import { Button } from "@lunarisapp/ui/components/button";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function PermissionDenied({ backTo }: { backTo: string }) {
  const { t } = useTranslation();

  return (
    <PanelError
      actions={
        <Button
          nativeButton={false}
          render={<Link to={backTo} />}
          variant="outline"
        >
          {t("editor.backToWorkspaces")}
        </Button>
      }
      data-testid="permission-denied"
      description={t("permissions.deniedDescription")}
      title={t("permissions.deniedTitle")}
      variant="error"
    />
  );
}
