import { Button } from "@lunarisapp/ui/components/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@lunarisapp/ui/components/toggle-group";
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
  onChoose: (params: {
    interval: BillingInterval;
    plan: PurchasablePlan;
    slug: string;
  }) => void;
  onIntervalChange: (interval: BillingInterval) => void;
  t: TFunction;
}) {
  const plans = PUBLIC_PLAN_CATALOG.filter(
    (definition) => definition.interval === interval
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex @lg/billing:flex-row flex-col items-start @lg/billing:items-center @lg/billing:justify-between gap-3">
        <h2 className="font-medium text-sm">
          {t("organization.billing.choosePlanTitle")}
        </h2>
        <ToggleGroup
          aria-label={t("organization.billing.choosePlanTitle")}
          className="max-w-full flex-wrap rounded-xl bg-muted p-1"
          onValueChange={(value) => {
            const nextInterval = value[0];
            if (
              nextInterval === BILLING_INTERVAL.month ||
              nextInterval === BILLING_INTERVAL.year
            ) {
              onIntervalChange(nextInterval);
            }
          }}
          size="sm"
          spacing={1}
          value={[interval]}
        >
          <ToggleGroupItem
            className="@lg/billing:h-8 h-11 min-w-0 whitespace-normal rounded-lg px-4 text-muted-foreground active:translate-y-px aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            value={BILLING_INTERVAL.month}
          >
            {t("organization.billing.monthlyBilling")}
          </ToggleGroupItem>
          <ToggleGroupItem
            className="@lg/billing:h-8 h-11 min-w-0 whitespace-normal rounded-lg px-4 text-muted-foreground active:translate-y-px aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            value={BILLING_INTERVAL.year}
          >
            {t("organization.billing.annualBilling")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="grid @lg/billing:grid-cols-2 gap-4">
        {plans.map((definition) => {
          const monthlyDefinition = PUBLIC_PLAN_CATALOG.find(
            (candidate) =>
              candidate.interval === BILLING_INTERVAL.month &&
              candidate.plan === definition.plan
          );

          return (
            <div
              className="flex min-w-0 flex-col gap-4 rounded-xl border p-4"
              key={definition.slug}
            >
              <div>
                <h3 className="font-semibold text-lg">
                  {PLAN_NAMES[definition.plan]}
                </h3>
                <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-semibold text-2xl tabular-nums">
                  <span>
                    {interval === BILLING_INTERVAL.year &&
                      monthlyDefinition && (
                        <>
                          <s className="font-normal text-base text-muted-foreground">
                            {formatCurrency(
                              monthlyDefinition.pricePerMemberMonthlyCents,
                              "USD"
                            )}
                          </s>{" "}
                        </>
                      )}
                    {formatCurrency(
                      definition.pricePerMemberMonthlyCents,
                      "USD"
                    )}
                  </span>
                  <span className="font-normal text-muted-foreground text-sm">
                    {t("organization.billing.perMemberMonth")}
                  </span>
                </p>
              </div>
              <Button
                className="mt-auto @lg/billing:h-8 h-11 w-full"
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
