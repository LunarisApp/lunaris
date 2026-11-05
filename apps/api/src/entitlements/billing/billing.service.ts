import { DatabaseService } from "@app/db";
import type { DatabaseOrTx } from "@app/db/utils";
import { POLAR_CLIENT } from "@app/polar";
import { Inject, Injectable } from "@nestjs/common";
import type { models, Polar } from "@polar-sh/sdk/2026-10";
import type {
  BillingInterval,
  PlanDefinition,
  PurchasablePlan,
} from "@repo/auth/billing";
import {
  LIMIT,
  PLAN,
  type PlanSlug,
  resolveEntitlements,
  resolvePlanSlug,
} from "@repo/auth/entitlements";
import { and, eq, inArray, sql } from "drizzle-orm";
import { log, parseError } from "evlog";
import { AppConfig } from "../../app.config";
import { member, organization } from "../../auth/auth.entity";
import {
  OrganizationBillingOwnerRequiredError,
  OrganizationBillingUnavailableError,
  OrganizationPlanMemberLimitError,
  OrganizationSubscriptionConflictError,
  SubscriptionOwnershipMismatchError,
  SubscriptionPurchaserMismatchError,
} from "../core/entitlements.errors";
import { PLAN_DEFINITIONS } from "./plan-definitions.token";
import { subscription } from "./subscription.entity";
import {
  lockOrganizationCapacity,
  readOrganizationOccupancy,
} from "../seats/organization-capacity";

type Subscription = models.Subscription;

const ACCESS_STATUSES = ["active", "trialing"];

export interface ActiveSubscription {
  currentPeriodEnd: Date | null;
  id: string;
  planSlug: PlanSlug;
  productId: string;
}

export interface CreateCheckoutParams {
  interval: BillingInterval;
  organizationId: string;
  plan: PurchasablePlan;
  user: { email: string; id: string; name: string };
}

export interface ChangePlanParams {
  interval: BillingInterval;
  organizationId: string;
  plan: PurchasablePlan;
  userId: string;
}

export interface OrganizationUserParams {
  organizationId: string;
  userId: string;
}

export interface UpsertSubscriptionParams {
  canceledAt: Date | null;
  currentPeriodEnd: Date | null;
  modifiedAt: Date | null;
  organizationId: string;
  polarSubscriptionId: string;
  productId: string;
  purchasedByUserId: string;
  status: string;
}

interface OrganizationOccupancy {
  members: number;
  pendingInvitations: number;
}

export interface OrganizationBillingState {
  activeSubscriptions: Array<{
    amount: number;
    cancelAtPeriodEnd: boolean;
    currency: string;
    currentPeriodEnd: string;
    id: string;
    productId: string;
    recurringInterval: string;
    seats: number | null;
    status: string;
  }>;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly dbService: DatabaseService,
    @Inject(PLAN_DEFINITIONS) private readonly plans: readonly PlanDefinition[],
    @Inject(POLAR_CLIENT) private readonly polar: Polar | null,
    private readonly appConfig: AppConfig
  ) {}

  get isAvailable(): boolean {
    return Boolean(this.polar);
  }

  async createCheckout(params: CreateCheckoutParams): Promise<{ url: string }> {
    await this.assertBillingOwner(params.user.id, params.organizationId);
    const polar = this.requirePolar();
    const selectedPlan = this.requirePlan(params.plan, params.interval);

    return this.dbService.db.transaction(async (tx) => {
      await lockOrganizationCapacity(tx, params.organizationId);

      if (
        (await this.readActiveSubscription(tx, params.organizationId)) ||
        (await this.readRemoteActiveSubscription(params.organizationId))
      ) {
        throw new OrganizationSubscriptionConflictError();
      }

      const occupancy = await readOrganizationOccupancy(
        tx,
        params.organizationId
      );
      this.assertPlanMemberCapacity(params.plan, occupancy);

      const eligiblePlans = this.plans.filter((plan) =>
        this.planHasMemberCapacity(plan.plan, occupancy)
      );
      const productIds = eligiblePlans.map((plan) => plan.productId);
      const seats = Math.max(1, occupancy.members);
      const openCheckouts = await polar.checkouts.list({
        external_customer_id: params.user.id,
        limit: 100,
        status: "open",
      });
      const matchingCheckouts = openCheckouts.items.filter(
        (checkout) =>
          checkout.metadata.referenceId === params.organizationId &&
          new Date(checkout.expires_at) > new Date() &&
          checkout.seats === seats &&
          checkout.products.some(
            (product) => product.id === selectedPlan.productId
          )
      );
      if (matchingCheckouts.length > 1) {
        throw new OrganizationSubscriptionConflictError(
          "Organization has multiple open checkouts"
        );
      }
      const reusableCheckout = matchingCheckouts[0];

      if (reusableCheckout) {
        if (reusableCheckout.product?.id === selectedPlan.productId) {
          return { url: reusableCheckout.url };
        }
        const checkout = await polar.checkouts.update(reusableCheckout.id, {
          product_id: selectedPlan.productId,
          seats,
        });
        return { url: checkout.url };
      }

      const billingUrl = await this.getOrganizationBillingUrl(
        tx,
        params.organizationId
      );
      const checkout = await polar.checkouts.create({
        allow_trial: false,
        customer_email: params.user.email,
        customer_name: params.user.name,
        external_customer_id: params.user.id,
        max_seats: seats,
        metadata: { referenceId: params.organizationId },
        min_seats: seats,
        products: [
          selectedPlan.productId,
          ...productIds.filter(
            (productId) => productId !== selectedPlan.productId
          ),
        ],
        return_url: billingUrl,
        seats,
        success_url: billingUrl,
      });
      return { url: checkout.url };
    });
  }

  async createPortal(params: OrganizationUserParams): Promise<{ url: string }> {
    await this.assertBillingOwner(params.userId, params.organizationId);
    const polar = this.requirePolar();
    const returnUrl = await this.getOrganizationBillingUrl(
      this.dbService.db,
      params.organizationId
    );
    const session = await polar.customerSessions.create({
      external_customer_id: params.userId,
      external_member_id: params.userId,
      return_url: returnUrl,
    });
    return { url: session.customer_portal_url };
  }

  async getBillingState(
    params: OrganizationUserParams
  ): Promise<OrganizationBillingState> {
    await this.assertBillingOwner(params.userId, params.organizationId);
    const polar = this.requirePolar();
    const response = await polar.subscriptions.list({
      active: true,
      limit: 2,
      metadata: { referenceId: params.organizationId },
    });
    if (response.items.length > 1) {
      throw new OrganizationSubscriptionConflictError(
        "Organization has multiple active subscriptions"
      );
    }

    const remote = response.items[0];
    if (!remote) {
      return { activeSubscriptions: [] };
    }

    return {
      activeSubscriptions: [
        {
          amount: remote.amount,
          cancelAtPeriodEnd: remote.cancel_at_period_end,
          currency: remote.currency,
          currentPeriodEnd: new Date(remote.current_period_end).toISOString(),
          id: remote.id,
          productId: remote.product_id,
          recurringInterval: remote.recurring_interval,
          seats: remote.seats ?? null,
          status: remote.status,
        },
      ],
    };
  }

  async changePlan(params: ChangePlanParams): Promise<void> {
    await this.assertBillingOwner(params.userId, params.organizationId);
    const polar = this.requirePolar();
    const target = this.requirePlan(params.plan, params.interval);

    await this.dbService.db.transaction(async (tx) => {
      await lockOrganizationCapacity(tx, params.organizationId);
      const active =
        (await this.readRemoteActiveSubscription(params.organizationId)) ??
        (await this.readActiveSubscription(tx, params.organizationId));
      if (!active) {
        throw new OrganizationSubscriptionConflictError(
          "Organization does not have an active subscription"
        );
      }
      if (active.planSlug !== PLAN.plus && active.planSlug !== PLAN.business) {
        throw new OrganizationSubscriptionConflictError(
          "Organization subscription cannot be changed through self-service billing"
        );
      }

      const occupancy = await readOrganizationOccupancy(
        tx,
        params.organizationId
      );
      this.assertPlanMemberCapacity(params.plan, occupancy);
      if (active.productId === target.productId) {
        return;
      }

      const remote = await polar.subscriptions.update(active.id, {
        product_id: target.productId,
        proration_behavior: "prorate",
      });
      await this.upsertSubscription(
        {
          organizationId: params.organizationId,
          purchasedByUserId: params.userId,
          polarSubscriptionId: remote.id,
          productId: remote.product_id,
          status: remote.status,
          canceledAt: remote.canceled_at ? new Date(remote.canceled_at) : null,
          currentPeriodEnd: new Date(remote.current_period_end),
          modifiedAt: new Date(remote.modified_at ?? remote.created_at),
        },
        tx
      );
    });
  }

  async canManageBilling(
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    const [row] = await this.dbService.db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.userId, userId),
          eq(member.organizationId, organizationId),
          eq(member.role, "owner")
        )
      )
      .limit(1);
    return Boolean(row);
  }

  async hasActiveSubscription(organizationId: string): Promise<boolean> {
    const local = await this.readActiveSubscription(
      this.dbService.db,
      organizationId
    );
    if (local) {
      return true;
    }
    if (!this.polar) {
      return false;
    }

    const remote = await this.polar.subscriptions.list({
      active: true,
      limit: 1,
      metadata: { referenceId: organizationId },
    });
    return remote.items.length > 0;
  }

  async upsertSubscription(
    params: UpsertSubscriptionParams,
    transaction?: DatabaseOrTx
  ): Promise<void> {
    const planSlug = resolvePlanSlug(params.productId, this.plans);

    const write = async (tx: DatabaseOrTx) => {
      await lockOrganizationCapacity(tx, params.organizationId);
      // Row locks cannot serialize the first delivery while no row exists yet.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('billing-subscription'), hashtext(${params.polarSubscriptionId}))`
      );
      const [existing] = await tx
        .select({
          modifiedAt: subscription.modifiedAt,
          organizationId: subscription.organizationId,
          purchasedByUserId: subscription.purchasedByUserId,
        })
        .from(subscription)
        .where(eq(subscription.polarSubscriptionId, params.polarSubscriptionId))
        .for("update");

      if (existing && existing.organizationId !== params.organizationId) {
        throw new SubscriptionOwnershipMismatchError({
          existingOrganizationId: existing.organizationId,
          incomingOrganizationId: params.organizationId,
          polarSubscriptionId: params.polarSubscriptionId,
        });
      }
      if (
        existing?.modifiedAt &&
        (!params.modifiedAt || existing.modifiedAt > params.modifiedAt)
      ) {
        return;
      }
      if (existing && existing.purchasedByUserId !== params.purchasedByUserId) {
        throw new SubscriptionPurchaserMismatchError({
          existingUserId: existing.purchasedByUserId,
          incomingUserId: params.purchasedByUserId,
          polarSubscriptionId: params.polarSubscriptionId,
        });
      }

      const [owner] = await tx
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.organizationId, params.organizationId),
            eq(member.userId, params.purchasedByUserId),
            eq(member.role, "owner")
          )
        )
        .limit(1);
      if (!(owner || existing)) {
        log.warn({
          args: [
            {
              organizationId: params.organizationId,
              subscriptionId: params.polarSubscriptionId,
              userId: params.purchasedByUserId,
            },
          ],
          context: "BillingService",
          message: "Ignoring subscription from a non-owner purchaser",
        });
        return;
      }

      if (!planSlug) {
        if (existing) {
          await tx
            .update(subscription)
            .set({
              modifiedAt: params.modifiedAt,
              productId: params.productId,
              status: ACCESS_STATUSES.includes(params.status)
                ? "unsupported"
                : params.status,
            })
            .where(
              eq(subscription.polarSubscriptionId, params.polarSubscriptionId)
            );
        }
        return;
      }

      const values = {
        canceledAt: params.canceledAt,
        currentPeriodEnd: params.currentPeriodEnd,
        modifiedAt: params.modifiedAt,
        organizationId: params.organizationId,
        planSlug,
        productId: params.productId,
        purchasedByUserId: params.purchasedByUserId,
        status: params.status,
      };
      if (existing) {
        await tx
          .update(subscription)
          .set(values)
          .where(
            eq(subscription.polarSubscriptionId, params.polarSubscriptionId)
          );
      } else {
        await tx.insert(subscription).values({
          polarSubscriptionId: params.polarSubscriptionId,
          ...values,
        });
      }
    };
    if (transaction) {
      await write(transaction);
    } else {
      await this.dbService.db.transaction(write);
    }
  }

  async reconcileSubscriptions(): Promise<{ checked: number; failed: number }> {
    if (!this.polar) {
      return { checked: 0, failed: 0 };
    }
    const active: Subscription[] = [];
    let checked = 0;
    let failed = 0;
    const synchronize = async (remote: Subscription) => {
      const organizationId = remote.metadata.referenceId;
      const purchasedByUserId = remote.customer.external_id;
      if (typeof organizationId !== "string" || !purchasedByUserId) {
        return;
      }
      checked++;
      try {
        await this.upsertSubscription({
          organizationId,
          purchasedByUserId,
          polarSubscriptionId: remote.id,
          productId: remote.product_id,
          status: remote.status,
          canceledAt: remote.canceled_at ? new Date(remote.canceled_at) : null,
          currentPeriodEnd: new Date(remote.current_period_end),
          modifiedAt: new Date(remote.modified_at ?? remote.created_at),
        });
      } catch (error) {
        failed++;
        log.error({
          context: "BillingService",
          message: "Subscription reconciliation failed",
          args: [
            {
              organizationId,
              subscriptionId: remote.id,
              error: parseError(error),
            },
          ],
        });
      }
    };
    const subscriptions = this.polar.subscriptions.iterList({ limit: 100 });
    for await (const remote of subscriptions) {
      if (ACCESS_STATUSES.includes(remote.status)) {
        active.push(remote);
      } else {
        await synchronize(remote);
      }
    }
    // Apply revocations before activations so replacement subscriptions do not
    // collide with the organization's unique active-subscription constraint.
    for (const remote of active) {
      await synchronize(remote);
    }
    return { checked, failed };
  }

  async readActiveSubscription(
    db: DatabaseOrTx,
    organizationId: string
  ): Promise<ActiveSubscription | null> {
    const [row] = await db
      .select({
        currentPeriodEnd: subscription.currentPeriodEnd,
        id: subscription.polarSubscriptionId,
        planSlug: subscription.planSlug,
        productId: subscription.productId,
      })
      .from(subscription)
      .where(
        and(
          eq(subscription.organizationId, organizationId),
          inArray(subscription.status, ACCESS_STATUSES)
        )
      )
      .limit(1);

    if (!(row && Object.hasOwn(PLAN, row.planSlug))) {
      return null;
    }
    return { ...row, planSlug: row.planSlug as PlanSlug };
  }

  private async assertBillingOwner(
    userId: string,
    organizationId: string
  ): Promise<void> {
    if (!(await this.canManageBilling(userId, organizationId))) {
      throw new OrganizationBillingOwnerRequiredError();
    }
  }

  private assertPlanMemberCapacity(
    plan: PurchasablePlan,
    occupancy: OrganizationOccupancy
  ): void {
    const limit = resolveEntitlements(plan).limit(LIMIT.maxMembers);
    if (occupancy.members + occupancy.pendingInvitations > limit) {
      throw new OrganizationPlanMemberLimitError(limit);
    }
  }

  private planHasMemberCapacity(
    plan: PurchasablePlan,
    occupancy: OrganizationOccupancy
  ): boolean {
    const limit = resolveEntitlements(plan).limit(LIMIT.maxMembers);
    return occupancy.members + occupancy.pendingInvitations <= limit;
  }

  private requirePlan(
    plan: PurchasablePlan,
    interval: BillingInterval
  ): PlanDefinition {
    const definition = this.plans.find(
      (candidate) => candidate.plan === plan && candidate.interval === interval
    );
    if (!definition) {
      throw new OrganizationBillingUnavailableError();
    }
    return definition;
  }

  private requirePolar(): Polar {
    if (!this.polar) {
      throw new OrganizationBillingUnavailableError();
    }
    return this.polar;
  }

  private async getOrganizationBillingUrl(
    db: DatabaseOrTx,
    organizationId: string
  ): Promise<string> {
    const [organizationRow] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    if (!organizationRow) {
      throw new OrganizationBillingOwnerRequiredError();
    }
    return new URL(
      `/${encodeURIComponent(organizationRow.slug)}/settings?tab=billing`,
      this.appConfig.frontendUrl
    ).toString();
  }

  private async readRemoteActiveSubscription(
    organizationId: string
  ): Promise<ActiveSubscription | null> {
    if (!this.polar) {
      return null;
    }
    const response = await this.polar.subscriptions.list({
      active: true,
      limit: 2,
      metadata: { referenceId: organizationId },
    });
    if (response.items.length > 1) {
      throw new OrganizationSubscriptionConflictError(
        "Organization has multiple active subscriptions"
      );
    }
    const remote = response.items[0];
    if (!remote) {
      return null;
    }
    return {
      currentPeriodEnd: new Date(remote.current_period_end),
      id: remote.id,
      planSlug: resolvePlanSlug(remote.product_id, this.plans) ?? PLAN.free,
      productId: remote.product_id,
    };
  }
}
