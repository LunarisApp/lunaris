import { formatStorageBytes } from "@repo/auth/storage";
import { useTranslation } from "react-i18next";
import type { EntitlementStatus } from "../../entitlements";
import { BillingUsageMetric } from "./billing-usage-metric";

export function OrganizationStorageUsage({ storage }: { storage?: EntitlementStatus["storage"] }) {
  const { t } = useTranslation();
  const usageText = storage
    ? t("organization.billing.storageUsage", {
        used: formatStorageBytes(storage.committedBytes),
        total: formatStorageBytes(storage.maxStorageBytes),
      })
    : t("organization.billing.usageUnavailable");
  const details = storage
    ? t("organization.billing.storageDetails", {
        reserved: formatStorageBytes(storage.reservedBytes),
        maximum: formatStorageBytes(storage.maxFileBytes),
      })
    : undefined;
  return (
    <BillingUsageMetric
      label={t("organization.billing.storageTitle")}
      valueText={usageText}
      hint={details}
      progressText={details ? `${usageText}. ${details}` : usageText}
      value={storage ? storage.committedBytes + storage.reservedBytes : undefined}
      max={storage?.maxStorageBytes}
    >
      {storage && storage.committedBytes + storage.reservedBytes >= storage.maxStorageBytes && (
        <p className="text-destructive" role="status">
          {t("organization.billing.storageFull")}
        </p>
      )}
    </BillingUsageMetric>
  );
}
