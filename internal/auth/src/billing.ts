import { PLAN } from "./entitlements";

export const BILLING_INTERVAL = {
  month: "month",
  year: "year",
} as const;

export type BillingInterval =
  (typeof BILLING_INTERVAL)[keyof typeof BILLING_INTERVAL];
export type PurchasablePlan = typeof PLAN.plus | typeof PLAN.business;

export interface PublicPlanDefinition {
  interval: BillingInterval;
  plan: PurchasablePlan;
  pricePerMemberMonthlyCents: number;
  slug: string;
}

export interface PlanDefinition extends PublicPlanDefinition {
  productId: string;
}

export interface PolarProductIds {
  businessMonthly: string;
  businessYearly: string;
  plusMonthly: string;
  plusYearly: string;
}

export const PUBLIC_PLAN_CATALOG = [
  {
    interval: BILLING_INTERVAL.month,
    plan: PLAN.plus,
    pricePerMemberMonthlyCents: 1000,
    slug: "plus-monthly",
  },
  {
    interval: BILLING_INTERVAL.year,
    plan: PLAN.plus,
    pricePerMemberMonthlyCents: 800,
    slug: "plus-yearly",
  },
  {
    interval: BILLING_INTERVAL.month,
    plan: PLAN.business,
    pricePerMemberMonthlyCents: 2000,
    slug: "business-monthly",
  },
  {
    interval: BILLING_INTERVAL.year,
    plan: PLAN.business,
    pricePerMemberMonthlyCents: 1600,
    slug: "business-yearly",
  },
] as const satisfies readonly PublicPlanDefinition[];

export function createPlans(productIds: PolarProductIds): PlanDefinition[] {
  const productIdValues = Object.values(productIds);
  if (
    productIdValues.some((productId) => productId.length === 0) ||
    new Set(productIdValues).size !== productIdValues.length
  ) {
    throw new Error("Polar product IDs must be non-empty and unique.");
  }
  const ids: Record<(typeof PUBLIC_PLAN_CATALOG)[number]["slug"], string> = {
    "business-monthly": productIds.businessMonthly,
    "business-yearly": productIds.businessYearly,
    "plus-monthly": productIds.plusMonthly,
    "plus-yearly": productIds.plusYearly,
  };

  return PUBLIC_PLAN_CATALOG.map((definition) => ({
    ...definition,
    productId: ids[definition.slug],
  }));
}
