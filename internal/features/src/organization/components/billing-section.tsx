"use client";

import { OrganizationPlanUsage } from "./organization-plan-usage";
import {
  CurrentPlanSummary,
  type PlanSummaryDetails,
} from "./current-plan-summary";
import { UpgradeOptions } from "./billing-plan-options";
import { formatCurrency, PLAN_NAMES } from "./billing-format";

import { Button } from "@lunarisapp/ui/components/button";
import { HugeiconsIcon, Refresh01Icon } from "@lunarisapp/ui/icons";
import {
  BILLING_INTERVAL,
  type BillingInterval,
  type PurchasablePlan,
} from "@repo/auth/billing";
import { PLAN, type PlanSlug } from "@repo/auth/entitlements";
import { permission } from "@repo/auth/permissions";
import { usePlatform } from "@repo/platform";
import { useQuery } from "@tanstack/react-query";
import { log, parseError } from "evlog";
import type { TFunction } from "i18next";
import posthog from "posthog-js";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApi } from "../../api";
import { useAuth } from "../../auth";
import {
  type EntitlementFreshness,
  type EntitlementStatus,
  useEntitlementStatus,
  useRefreshEntitlements,
} from "../../entitlements";
import { usePermission } from "../../permissions";
import { useRegion } from "../../region";
import { billingStateQueryOptions, type Subscription } from "../queries";

function formatInterval(interval: string, t: TFunction): string {
  return interval === BILLING_INTERVAL.year
    ? t("organization.billing.yearly")
    : t("organization.billing.monthly");
}

const FRESHNESS_BADGE_KEYS: Record<
  Exclude<EntitlementFreshness, "live">,
  string
> = {
  cached: "organization.billing.cached",
  expired: "organization.billing.verificationExpired",
  unverified: "organization.billing.unverified",
};

function getPlanSummaryDetails(
  plan: PlanSlug,
  subscription: Subscription | undefined,
  status: EntitlementStatus,
  t: TFunction
): PlanSummaryDetails {
  const details: PlanSummaryDetails = {
    badge: t("organization.billing.active"),
    badgeVariant: "active",
    description:
      plan === PLAN.free
        ? t("organization.billing.freePlanDescription")
        : t("organization.billing.billingDetailsUnavailable"),
    name: PLAN_NAMES[plan],
  };

  if (subscription) {
    const canceling = subscription.cancelAtPeriodEnd;
    const seats = subscription.seats;
    const seatDescription =
      typeof seats === "number" && Number.isInteger(seats) && seats > 0
        ? t("organization.billing.seatsTaken", { count: seats })
        : t("organization.billing.seatsUnavailable");
    details.badge = canceling
      ? t("organization.billing.canceling")
      : t(`organization.billing.${subscription.status}`);
    details.badgeVariant = canceling ? "muted" : "active";
    details.description = `${formatCurrency(
      subscription.amount,
      subscription.currency
    )} / ${formatInterval(subscription.recurringInterval, t)} · ${seatDescription} · ${
      canceling
        ? t("organization.billing.endsOn")
        : t("organization.billing.renewsOn")
    } ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`;
  } else if (status.freshness !== "live") {
    details.badge = t(FRESHNESS_BADGE_KEYS[status.freshness]);
    details.badgeVariant = "muted";
    if (status.verifiedAt && status.freshness !== "unverified") {
      details.description = t("organization.billing.lastVerified", {
        date: new Date(status.verifiedAt).toLocaleString(),
      });
    }
  }

  return details;
}

export function BillingSection({
  isOwner,
  organizationId,
}: {
  isOwner: boolean;
  organizationId: string;
}) {
  const { navigation } = usePlatform();
  const { t } = useTranslation();
  const api = useApi();
  const auth = useAuth();
  const { data: session, isPending: sessionPending } = auth.useSession();
  const sessionUserId = session?.user?.id;
  const isAnonymous = session?.user?.isAnonymous ?? false;
  const userId = sessionUserId ?? "anonymous";
  const status = useEntitlementStatus();
  const refreshEntitlements = useRefreshEntitlements();
  const { region } = useRegion();
  const billingEnabled = status.billingManagement === "polar";
  const [interval, setInterval] = useState<BillingInterval>(
    BILLING_INTERVAL.year
  );
  const [portalLoading, setPortalLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);

  const canReadBilling = usePermission(permission.billing.read);
  const hasBillingUpdatePermission = usePermission(permission.billing.update);
  const canManageBilling = isOwner && hasBillingUpdatePermission;
  const hasSelfServeSubscription =
    status.displayPlan === PLAN.plus || status.displayPlan === PLAN.business;

  const billingStateQuery = useQuery({
    ...billingStateQueryOptions(api, region.id, userId, organizationId),
    enabled:
      !sessionPending &&
      canReadBilling &&
      !isAnonymous &&
      billingEnabled &&
      canManageBilling &&
      hasSelfServeSubscription &&
      !!organizationId,
  });
  const currentSubscription = status.isOnline
    ? billingStateQuery.data?.activeSubscriptions[0]
    : undefined;

  const handleManage = async () => {
    posthog.capture("subscription_portal_opened");
    setPortalLoading(true);
    try {
      const result = await api.post<{ url: string }>("/v1/entitlements/portal");
      if (!result.url) {
        throw new Error("Portal URL missing");
      }
      navigation.assign(result.url);
    } catch (error) {
      log.error({
        error: parseError(error),
        msg: "failed to open portal",
        tag: "Billing",
      });
      toast.error(t("organization.billing.error"));
    } finally {
      setPortalLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshEntitlements(),
        ...(billingEnabled && canManageBilling && hasSelfServeSubscription
          ? [billingStateQuery.refetch()]
          : []),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const handlePlanChoice = async (choice: {
    interval: BillingInterval;
    plan: PurchasablePlan;
    slug: string;
  }) => {
    if (!organizationId) {
      return;
    }
    posthog.capture(
      hasSelfServeSubscription
        ? "subscription_plan_change_started"
        : "subscription_checkout_started",
      {
        interval: choice.interval,
        plan: choice.plan,
        organization_id: organizationId,
      }
    );
    setLoadingSlug(choice.slug);
    try {
      if (hasSelfServeSubscription) {
        const result = await api.post<{ success: true }>(
          "/v1/entitlements/change-plan",
          {
            body: { interval: choice.interval, plan: choice.plan },
          }
        );
        if (result.success !== true) {
          throw new Error("Plan change failed");
        }
        await Promise.all([refreshEntitlements(), billingStateQuery.refetch()]);
      } else {
        const result = await api.post<{ url: string }>(
          "/v1/entitlements/checkout",
          {
            body: { interval: choice.interval, plan: choice.plan },
          }
        );
        if (!result.url) {
          throw new Error("Checkout URL missing");
        }
        navigation.assign(result.url);
      }
    } catch (error) {
      log.error({
        error: parseError(error),
        msg: hasSelfServeSubscription
          ? "plan change failed"
          : "checkout failed",
        tag: "Billing",
      });
      toast.error(t("organization.billing.error"));
    } finally {
      setLoadingSlug(null);
    }
  };

  const details = getPlanSummaryDetails(
    status.displayPlan,
    currentSubscription,
    status,
    t
  );
  const canChoosePlan =
    billingEnabled &&
    canManageBilling &&
    (status.displayPlan === PLAN.free || hasSelfServeSubscription) &&
    status.freshness === "live" &&
    status.isOnline;

  return (
    <div
      className="@container/billing flex w-full min-w-0 max-w-3xl flex-col gap-8"
      data-testid="organization-panel-billing"
    >
      <CurrentPlanSummary
        actionsDisabled={!status.isOnline}
        details={details}
        manage={
          billingEnabled && canManageBilling && hasSelfServeSubscription
            ? () => void handleManage()
            : undefined
        }
        manageLoading={portalLoading}
        refresh={
          canReadBilling && (
            <Button
              aria-label={t("common.refresh")}
              className="@lg/billing:size-8 size-11"
              data-testid="organization-billing-refresh"
              disabled={refreshing || sessionPending || !status.isOnline}
              onClick={() => void handleRefresh()}
              size="icon-sm"
              variant="outline"
            >
              <HugeiconsIcon
                aria-hidden="true"
                className={refreshing ? "animate-spin" : undefined}
                icon={Refresh01Icon}
                strokeWidth={2}
              />
            </Button>
          )
        }
        t={t}
      />

      <OrganizationPlanUsage status={status} />

      {!!(billingEnabled && status.isOnline && billingStateQuery.isError) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-destructive text-sm" role="alert">
            {t("organization.billing.error")}
          </p>
          <Button
            onClick={() => void handleRefresh()}
            size="sm"
            variant="outline"
          >
            {t("organization.billing.retry")}
          </Button>
        </div>
      )}

      {!!canChoosePlan && (
        <UpgradeOptions
          interval={interval}
          loadingSlug={loadingSlug}
          onChoose={(choice) => void handlePlanChoice(choice)}
          onIntervalChange={setInterval}
          t={t}
        />
      )}
    </div>
  );
}
