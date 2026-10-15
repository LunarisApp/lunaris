import { Button } from "@lunarisapp/ui/components/button";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import { Home07Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function OrganizationNotFound() {
  const { t } = useTranslation();
  return (
    <PanelError
      actions={
        <Button nativeButton={false} render={<Link to="/" />} variant="outline">
          <HugeiconsIcon icon={Home07Icon} />
          {t("organization.notFoundHome")}
        </Button>
      }
      description={t("organization.notFoundDescription")}
      title={t("organization.notFoundTitle")}
      variant="not-found"
    />
  );
}
