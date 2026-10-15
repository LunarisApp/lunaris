import { BillingHint } from "./billing-hint";
import { BillingUsageMetric } from "./billing-usage-metric";
import { OrganizationStorageUsage } from "./organization-storage-usage";
import { UNLIMITED } from "@repo/auth/entitlements";
import { useTranslation } from "react-i18next";
import type { EntitlementStatus } from "../../entitlements";

export function OrganizationPlanUsage({ status }: { status: EntitlementStatus }) {
  const { t, i18n } = useTranslation();
  const format = new Intl.NumberFormat(i18n.language);
  const { usage } = status;
  const { memberCount, pendingInvitationCount } = usage ?? {};
  const membersKnown = memberCount !== undefined && pendingInvitationCount !== undefined;
  const metrics = [
    {
      label: t("organization.billing.resourcesTitle"),
      count: usage?.resourceCount,
      limit: usage?.maxResources,
      description: t("organization.billing.resourcesDetails"),
    },
    {
      label: t("organization.members"),
      count: membersKnown ? memberCount + pendingInvitationCount : undefined,
      limit: usage?.maxMembers,
      description: membersKnown
        ? t("organization.billing.membersDetails", {
            accepted: format.format(memberCount),
            pending: format.format(pendingInvitationCount),
          })
        : t("organization.billing.membersCapacityDetails"),
    },
  ];

  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-label={t("organization.billing.planUsageTitle")}
    >
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-medium">{t("organization.billing.planUsageTitle")}</h2>
        {status.freshness !== "live" && (
          <BillingHint
            label={t("organization.billing.planUsageTitle")}
            hint={t(
              usage ? "organization.billing.usageCached" : "organization.billing.usageUnavailable",
            )}
          />
        )}
      </div>
      <div className="grid divide-y rounded-xl border @2xl/billing:grid-cols-3 @2xl/billing:divide-x @2xl/billing:divide-y-0">
        {metrics.map(({ label, count, limit, description }) => {
          const known = count !== undefined && limit !== undefined;
          const unlimited = limit === UNLIMITED;
          const valueText = known
            ? t("organization.billing.storageUsage", {
                used: format.format(count),
                total: unlimited ? t("organization.billing.unlimited") : format.format(limit),
              })
            : t("organization.billing.usageUnavailable");
          return (
            <BillingUsageMetric
              key={label}
              label={label}
              hint={description}
              valueText={valueText}
              value={known && !unlimited ? count : undefined}
              max={known && !unlimited ? limit : undefined}
            >
              {known && !unlimited && count >= limit && (
                <p className="text-destructive text-sm" role="status">
                  {t(
                    count > limit
                      ? "organization.billing.usageOverLimit"
                      : "organization.billing.usageAtLimit",
                  )}
                </p>
              )}
            </BillingUsageMetric>
          );
        })}
        <OrganizationStorageUsage storage={status.storage} />
      </div>
    </section>
  );
}
