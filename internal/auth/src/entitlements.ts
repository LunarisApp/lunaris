import * as z from "zod";

export const PLAN = {
  free: "free",
  plus: "plus",
  business: "business",
  enterprise: "enterprise",
} as const;

export type PlanSlug = (typeof PLAN)[keyof typeof PLAN];

export const FEATURE = {
  agentWork: "agent-work",
} as const;

export type FeatureId = (typeof FEATURE)[keyof typeof FEATURE];
export type FeatureAccess = Readonly<Record<FeatureId, boolean>>;

export const LIMIT = {
  maxResources: "max_resources",
  maxMembers: "max_members",
  maxStorageBytes: "max_storage_bytes",
  maxFileBytes: "max_file_bytes",
} as const;

export type LimitId = (typeof LIMIT)[keyof typeof LIMIT];

export const UNLIMITED = Number.MAX_SAFE_INTEGER;
export const OWNED_ORGANIZATION_FAIR_USE_LIMIT = 10;

interface PlanEntitlements {
  limits: Readonly<Record<LimitId, number>>;
}

const PLAN_ENTITLEMENTS: Record<PlanSlug, PlanEntitlements> = {
  free: {
    limits: {
      [LIMIT.maxResources]: 25,
      [LIMIT.maxMembers]: 3,
      [LIMIT.maxStorageBytes]: 250_000_000,
      [LIMIT.maxFileBytes]: 25_000_000,
    },
  },
  plus: {
    limits: {
      [LIMIT.maxResources]: UNLIMITED,
      [LIMIT.maxMembers]: 10,
      [LIMIT.maxStorageBytes]: 10_000_000_000,
      [LIMIT.maxFileBytes]: 500_000_000,
    },
  },
  business: {
    limits: {
      [LIMIT.maxResources]: UNLIMITED,
      [LIMIT.maxMembers]: UNLIMITED,
      [LIMIT.maxStorageBytes]: 100_000_000_000,
      [LIMIT.maxFileBytes]: 5_000_000_000,
    },
  },
  enterprise: {
    limits: {
      [LIMIT.maxResources]: UNLIMITED,
      [LIMIT.maxMembers]: UNLIMITED,
      [LIMIT.maxStorageBytes]: 1_000_000_000_000,
      [LIMIT.maxFileBytes]: 5_000_000_000,
    },
  },
};

const PLAN_FEATURES: Record<PlanSlug, FeatureAccess> = {
  free: { [FEATURE.agentWork]: false },
  plus: { [FEATURE.agentWork]: false },
  business: { [FEATURE.agentWork]: false },
  enterprise: { [FEATURE.agentWork]: false },
};

export interface ResolvedEntitlements {
  limit: (limitId: LimitId) => number;
  limits: Readonly<Record<LimitId, number>>;
  plan: PlanSlug;
}

export const entitlementSnapshotSchema = z.object({
  billingManagement: z.enum(["polar", "unavailable"]),
  features: z.object({
    [FEATURE.agentWork]: z.boolean().default(false),
  }),
  resourceCount: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative().optional(),
  pendingInvitationCount: z.number().int().nonnegative().optional(),
  limits: z.object({
    [LIMIT.maxResources]: z.number().int().nonnegative(),
    [LIMIT.maxMembers]: z.number().int().nonnegative(),
    [LIMIT.maxStorageBytes]: z.number().int().nonnegative(),
    [LIMIT.maxFileBytes]: z.number().int().nonnegative(),
  }),
  storage: z
    .object({
      committedBytes: z.number().int().nonnegative(),
      reservedBytes: z.number().int().nonnegative(),
      verifiedAt: z.iso.datetime().nullable(),
      enforcementEnabled: z.boolean(),
    })
    .optional(),
  offlineAccessUntil: z.iso.datetime().nullable(),
  plan: z.enum(PLAN),
  verifiedAt: z.iso.datetime(),
  organizationId: z.string(),
});

export type EntitlementSnapshot = z.infer<typeof entitlementSnapshotSchema>;
export type BillingManagement = EntitlementSnapshot["billingManagement"];

export function resolveEntitlements(
  plan: PlanSlug = PLAN.free,
  enterpriseStorageOverride?: number | null
): ResolvedEntitlements {
  const entitlement = PLAN_ENTITLEMENTS[plan];
  const limits = { ...entitlement.limits };
  if (
    enterpriseStorageOverride != null &&
    (!Number.isSafeInteger(enterpriseStorageOverride) ||
      enterpriseStorageOverride < 0)
  ) {
    throw new RangeError(
      "Storage override must be a non-negative safe integer"
    );
  }
  if (plan === PLAN.enterprise && enterpriseStorageOverride != null) {
    limits[LIMIT.maxStorageBytes] = enterpriseStorageOverride;
  }

  return {
    plan,
    limits,
    limit: (limit) => limits[limit],
  };
}

export function resolvePlanFeatures(plan: PlanSlug): FeatureAccess {
  return { ...PLAN_FEATURES[plan] };
}

export function planHasFeature(plan: PlanSlug, feature: FeatureId): boolean {
  return PLAN_FEATURES[plan][feature];
}

export function resolvePlanSlug(
  productId: string,
  plans: ReadonlyArray<{ plan: string; productId: string }>
): PlanSlug | null {
  const slug = plans.find((plan) => plan.productId === productId)?.plan;
  return slug && Object.hasOwn(PLAN, slug) ? (slug as PlanSlug) : null;
}
