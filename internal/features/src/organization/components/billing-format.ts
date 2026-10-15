import type { PlanSlug } from "@repo/auth/entitlements";

export const PLAN_NAMES: Record<PlanSlug, string> = {
  business: "Business",
  enterprise: "Enterprise",
  free: "Free",
  plus: "Plus",
};

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    currency,
    style: "currency",
  }).format(amount / 100);
}
