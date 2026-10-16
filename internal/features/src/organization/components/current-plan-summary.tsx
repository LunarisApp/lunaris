import { Badge } from "@lunarisapp/ui/components/badge";
import { Button } from "@lunarisapp/ui/components/button";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";

export interface PlanSummaryDetails {
  badge: string;
  badgeVariant: "active" | "muted";
  description: string;
  name: string;
}

export function CurrentPlanSummary({
  actionsDisabled,
  details,
  manage,
  manageLoading,
  refresh,
  t,
}: {
  actionsDisabled: boolean;
  details: PlanSummaryDetails;
  manage?: () => void;
  manageLoading: boolean;
  refresh: ReactNode;
  t: TFunction;
}) {
  return (
    <section className="flex @lg/billing:flex-row flex-col @lg/billing:items-start @lg/billing:justify-between gap-4 border-b pb-6">
      <div className="min-w-0 flex-1 space-y-3">
        <h2 className="font-medium text-sm">
          {t("organization.billing.currentPlan")}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="font-bold text-4xl tracking-tight">{details.name}</p>
          <Badge
            className={
              details.badgeVariant === "active"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : ""
            }
            variant={
              details.badgeVariant === "active" ? "secondary" : "outline"
            }
          >
            {details.badge}
          </Badge>
        </div>
        <p className="wrap-anywhere max-w-prose text-muted-foreground text-sm leading-relaxed">
          {details.description}
        </p>
      </div>
      {!!(manage || refresh) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!!manage && (
            <Button
              className="@lg/billing:h-8 h-11"
              disabled={actionsDisabled || manageLoading}
              onClick={manage}
              size="sm"
              variant="outline"
            >
              {manageLoading
                ? t("common.loading")
                : t("organization.billing.manage")}
            </Button>
          )}
          {refresh}
        </div>
      )}
    </section>
  );
}
