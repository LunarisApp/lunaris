import { BILLING_INTERVAL } from "@repo/auth/billing";
import { PLAN } from "@repo/auth/entitlements";
import type { infer as Infer } from "zod";
import { z } from "zod";

export const billingPlanRequestSchema = z
  .object({
    interval: z.enum([BILLING_INTERVAL.month, BILLING_INTERVAL.year]),
    plan: z.enum([PLAN.plus, PLAN.business]),
  })
  .strict();

export const BillingPlanRequestDto = billingPlanRequestSchema.meta({
  id: "BillingPlanRequestDto",
});
export type BillingPlanRequestDto = Infer<typeof BillingPlanRequestDto>;

export const BillingCheckoutResponseDto = z
  .object({ url: z.string().url() })
  .meta({ id: "BillingCheckoutResponseDto" });
export type BillingCheckoutResponseDto = Infer<
  typeof BillingCheckoutResponseDto
>;

export const BillingPortalResponseDto = z
  .object({ url: z.string().url() })
  .meta({ id: "BillingPortalResponseDto" });
export type BillingPortalResponseDto = Infer<typeof BillingPortalResponseDto>;

export const BillingPlanChangeResponseDto = z
  .object({ success: z.literal(true) })
  .meta({ id: "BillingPlanChangeResponseDto" });
export type BillingPlanChangeResponseDto = Infer<
  typeof BillingPlanChangeResponseDto
>;

export const billingSubscriptionSchema = z.object({
  amount: z.number().int().nonnegative(),
  cancelAtPeriodEnd: z.boolean(),
  currency: z.string().min(1),
  currentPeriodEnd: z.string().datetime(),
  id: z.string().min(1),
  productId: z.string().min(1),
  recurringInterval: z.string().min(1),
  seats: z.number().int().positive().nullable(),
  status: z.string().min(1),
});

export const BillingStateResponseDto = z
  .object({ activeSubscriptions: z.array(billingSubscriptionSchema).max(1) })
  .meta({ id: "BillingStateResponseDto" });
export type BillingStateResponseDto = Infer<typeof BillingStateResponseDto>;
