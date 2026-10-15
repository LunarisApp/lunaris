import { Button } from "@lunarisapp/ui/components/button";
import { ToggleGroup, ToggleGroupItem } from "@lunarisapp/ui/components/toggle-group";
import {
  BILLING_INTERVAL,
  type BillingInterval,
  PUBLIC_PLAN_CATALOG,
  type PurchasablePlan,
} from "@repo/auth/billing";
import type { TFunction } from "i18next";
import { formatCurrency, PLAN_NAMES } from "./billing-format";

export function UpgradeOptions({
  interval,
  loadingSlug,
  onChoose,
  onIntervalChange,
  t,
}: {
  interval: BillingInterval;
  loadingSlug: string | null;
  onChoose: (params: { interval: BillingInterval; plan: PurchasablePlan; slug: string }) => void;
  onIntervalChange: (interval: BillingInterval) => void;
  t: TFunction;
}) {
  const plans = PUBLIC_PLAN_CATALOG.filter((definition) => definition.interval === interval);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-3 @lg/billing:flex-row @lg/billing:items-center @lg/billing:justify-between">
        <h2 className="text-sm font-medium">{t("organization.billing.choosePlanTitle")}</h2>
        <ToggleGroup
          aria-label={t("organization.billing.choosePlanTitle")}
          className="bg-muted max-w-full flex-wrap rounded-xl p-1"
          onValueChange={(value) => {
            const nextInterval = value[0];
            if (nextInterval === BILLING_INTERVAL.month || nextInterval === BILLING_INTERVAL.year) {
              onIntervalChange(nextInterval);
            }
          }}
          size="sm"
          spacing={1}
          value={[interval]}
        >
          <ToggleGroupItem
            className="text-muted-foreground h-11 min-w-0 rounded-lg px-4 whitespace-normal aria-pressed:bg-primary aria-pressed:text-primary-foreground active:translate-y-px @lg/billing:h-8"
            value={BILLING_INTERVAL.month}
          >
            {t("organization.billing.monthlyBilling")}
          </ToggleGroupItem>
          <ToggleGroupItem
            className="text-muted-foreground h-11 min-w-0 rounded-lg px-4 whitespace-normal aria-pressed:bg-primary aria-pressed:text-primary-foreground active:translate-y-px @lg/billing:h-8"
            value={BILLING_INTERVAL.year}
          >
            {t("organization.billing.annualBilling")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="grid gap-4 @lg/billing:grid-cols-2">
        {plans.map((definition) => {
          const monthlyDefinition = PUBLIC_PLAN_CATALOG.find(
            (candidate) =>
              candidate.interval === BILLING_INTERVAL.month && candidate.plan === definition.plan,
          );

          return (
            <div
              className="flex min-w-0 flex-col gap-4 rounded-xl border p-4"
              key={definition.slug}
            >
              <div>
                <h3 className="text-lg font-semibold">{PLAN_NAMES[definition.plan]}</h3>
                <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-2xl font-semibold tabular-nums">
                  <span>
                    {interval === BILLING_INTERVAL.year && monthlyDefinition && (
                      <>
                        <s className="text-muted-foreground text-base font-normal">
                          {formatCurrency(monthlyDefinition.pricePerMemberMonthlyCents, "USD")}
                        </s>{" "}
                      </>
                    )}
                    {formatCurrency(definition.pricePerMemberMonthlyCents, "USD")}
                  </span>
                  <span className="text-muted-foreground text-sm font-normal">
                    {t("organization.billing.perMemberMonth")}
                  </span>
                </p>
              </div>
              <Button
                className="mt-auto h-11 w-full @lg/billing:h-8"
                disabled={loadingSlug !== null}
                onClick={() => onChoose(definition)}
              >
                {loadingSlug === definition.slug
                  ? t("common.loading")
                  : t("organization.billing.choosePlan", {
                      name: PLAN_NAMES[definition.plan],
                    })}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
