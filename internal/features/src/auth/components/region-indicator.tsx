import { buttonVariants } from "@lunarisapp/ui/components/button";
import { GlobalIcon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useRegion } from "../../region";

export function RegionIndicator() {
  const { t } = useTranslation();
  const { pathWithRegion, region } = useRegion();

  return (
    <Link
      aria-label={t("auth.changeRegion", { region: region.label })}
      className={buttonVariants({
        variant: "ghost",
        size: "sm",
        className:
          "gap-1.5 text-muted-foreground text-xs uppercase tracking-wide",
      })}
      to={pathWithRegion("/auth")}
    >
      <HugeiconsIcon
        aria-hidden="true"
        className="size-3.5"
        icon={GlobalIcon}
      />
      <span>{region.id}</span>
    </Link>
  );
}
