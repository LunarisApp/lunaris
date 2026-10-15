import { Button } from "@lunarisapp/ui/components/button";
import { useTranslation } from "react-i18next";
import { useRegion } from "../../region";

export function RegionSwitcher() {
  const { t } = useTranslation();
  const { region, regions, setRegion } = useRegion();

  if (regions.length === 1) {
    return (
      <p className="px-1 text-center text-xs text-muted-foreground">
        {region.label}{" "}
        <span className="text-[10px] tracking-wide">
          ({region.id.toUpperCase()})
        </span>
      </p>
    );
  }

  return (
    <div
      aria-describedby="auth-region-description"
      aria-labelledby="auth-region-title"
      className="flex flex-col gap-2 px-1"
      role="group"
    >
      <div className="space-y-0.5">
        <p className="text-xs font-medium" id="auth-region-title">
          {t("auth.regionTitle")}
        </p>
        <p
          className="text-[11px] leading-snug text-muted-foreground"
          id="auth-region-description"
        >
          {t("auth.regionDescription")}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {regions.map((entry) => (
          <Button
            aria-pressed={entry.id === region.id}
            className="h-8 justify-between px-2 text-xs"
            disabled={entry.status !== "active"}
            key={entry.id}
            onClick={() => setRegion(entry.id)}
            type="button"
            variant={entry.id === region.id ? "default" : "outline"}
          >
            <span>{entry.label}</span>
            <span className="text-[10px] uppercase tracking-wide opacity-70">
              {entry.status === "active" ? entry.id : t("auth.regionComingSoon")}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
