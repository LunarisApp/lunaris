import { readOrganizationOccupancy } from "../seats/organization-capacity";
import { readStorageAccounting } from "../../files/storage-accounting";
import { DatabaseService } from "@app/db";
import type { DatabaseOrTx } from "@app/db/utils";
import { POSTHOG_CLIENT } from "@app/posthog";
import { Inject, Injectable } from "@nestjs/common";
import type {
  EntitlementSnapshot,
  FeatureAccess,
  FeatureId,
  PlanSlug,
  ResolvedEntitlements,
} from "@repo/auth/entitlements";
import {
  FEATURE,
  LIMIT,
  OWNED_ORGANIZATION_FAIR_USE_LIMIT,
  PLAN,
  resolveEntitlements,
  resolvePlanFeatures,
} from "@repo/auth/entitlements";
import { and, count, eq, notExists } from "drizzle-orm";
import { log, parseError } from "evlog";
import type { PostHog } from "posthog-node";
import { member, organization } from "../../auth/auth.entity";
import { workspacesDb } from "../../workspaces/core/workspaces.entity";
import {
  workspaceResourcesDb,
  workspaceResourceTrashDb,
} from "../../workspaces/resources/workspace-resources.entity";
import {
  type ChangePlanParams,
  type CreateCheckoutParams,
  type OrganizationBillingState,
  type OrganizationUserParams,
  type UpsertSubscriptionParams,
  BillingService,
} from "../billing/billing.service";
import {
  type MemberSeatReconciliationResult,
  SeatService,
} from "../seats/seat.service";
import { EntitlementsConfig } from "./entitlements.config";
import {
  FeatureAccessRequiredError,
  OrganizationResourceLimitError,
  OrganizationMembershipRequiredError,
} from "./entitlements.errors";

const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

interface FeatureAccessUser {
  email: string;
  id: string;
  isAnonymous: boolean;
}

interface FeatureAccessParams {
  feature: FeatureId;
  organizationId: string;
  user: FeatureAccessUser;
}

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly dbService: DatabaseService,
    @Inject(POSTHOG_CLIENT) private readonly posthog: PostHog | null,
    private readonly config: EntitlementsConfig,
    private readonly billing: BillingService,
    private readonly seats: SeatService,
  ) {}

  createCheckout(params: CreateCheckoutParams): Promise<{ url: string }> {
    return this.billing.createCheckout(params);
  }

  createPortal(params: OrganizationUserParams): Promise<{ url: string }> {
    return this.billing.createPortal(params);
  }

  getBillingState(
    params: OrganizationUserParams,
  ): Promise<OrganizationBillingState> {
    return this.billing.getBillingState(params);
  }

  changePlan(params: ChangePlanParams): Promise<void> {
    return this.billing.changePlan(params);
  }

  async resolveForOrganization(
    organizationId: string,
  ): Promise<ResolvedEntitlements> {
    const developmentPlan = this.config.developmentPlan;
    const active = developmentPlan ? null : await this.billing.readActiveSubscription(
      this.dbService.db,
      organizationId,
    );
    const accounting = await readStorageAccounting(this.dbService.db, organizationId);
    return resolveEntitlements(developmentPlan ?? active?.planSlug ?? PLAN.free, accounting.enterpriseOverrideBytes);
  }

  async resolveSnapshotForOrganization(params: {
    organizationId: string;
    user: FeatureAccessUser;
  }): Promise<EntitlementSnapshot> {
    const { organizationId, user } = params;
    const verifiedAt = new Date();
    const developmentPlan = this.config.developmentPlan;
    const active = developmentPlan
      ? null
      : await this.billing.readActiveSubscription(
          this.dbService.db,
          organizationId,
        );
    const resourceCount = await this.countOrganizationResources(
      this.dbService.db,
      organizationId,
    );
    const storage = await readStorageAccounting(this.dbService.db, organizationId);
    const occupancy = await readOrganizationOccupancy(this.dbService.db, organizationId);
    const entitlements = resolveEntitlements(
      developmentPlan ?? active?.planSlug ?? PLAN.free, storage.enterpriseOverrideBytes,
    );
    const features = await this.resolveFeatureAccess(entitlements.plan, user);

    return {
      billingManagement: this.billing.isAvailable ? "polar" : "unavailable",
      // Older desktop clients require this field when parsing snapshots.
      features: Object.assign({ assistant: false }, features),
      resourceCount,
      memberCount: occupancy.members,
      pendingInvitationCount: occupancy.pendingInvitations,
      storage: {
        committedBytes: storage.committedBytes, reservedBytes: storage.reservedBytes,
        verifiedAt: storage.verifiedAt, enforcementEnabled: storage.enforcementEnabled,
      },
      limits: { ...entitlements.limits },
      offlineAccessUntil:
        entitlements.plan === PLAN.free || developmentPlan
          ? null
          : new Date(
              Math.max(
                active?.currentPeriodEnd?.getTime() ?? 0,
                verifiedAt.getTime(),
              ) + OFFLINE_GRACE_MS,
            ).toISOString(),
      plan: entitlements.plan,
      verifiedAt: verifiedAt.toISOString(),
      organizationId,
    };
  }

  async hasFeatureAccess(params: FeatureAccessParams): Promise<boolean> {
    if (params.user.isAnonymous) return false;
    const entitlements = await this.resolveForOrganization(
      params.organizationId,
    );
    const features = await this.resolveFeatureAccess(
      entitlements.plan,
      params.user,
    );
    return features[params.feature];
  }

  async assertFeatureAccess(params: FeatureAccessParams): Promise<void> {
    try {
      await this.assertOrganizationMember(params.user.id, params.organizationId);
    } catch {
      throw new FeatureAccessRequiredError();
    }
    if (!(await this.hasFeatureAccess(params))) {
      throw new FeatureAccessRequiredError();
    }
  }

  async canCreateOwnedOrganization(userId: string): Promise<boolean> {
    const [row] = await this.dbService.db
      .select({ value: count() })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.role, "owner")));
    return (row?.value ?? 0) < OWNED_ORGANIZATION_FAIR_USE_LIMIT;
  }

  canManageBilling(
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    return this.billing.canManageBilling(userId, organizationId);
  }

  hasActiveSubscription(organizationId: string): Promise<boolean> {
    return this.billing.hasActiveSubscription(organizationId);
  }

  async assertOrganizationMember(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const [row] = await this.dbService.db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.userId, userId),
          eq(member.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!row) throw new OrganizationMembershipRequiredError();
  }

  async hasMembers(organizationId: string): Promise<boolean> {
    const [row] = await this.dbService.db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.organizationId, organizationId))
      .limit(1);
    return Boolean(row);
  }

  hasMemberCapacity(
    organizationId: string,
    options: { includePendingInvitations: boolean },
  ): Promise<boolean> {
    return this.seats.hasMemberCapacity(organizationId, options);
  }

  withMemberCapacity<T>(organizationId: string, write: (tx: DatabaseOrTx) => Promise<T>): Promise<T> {
    return this.seats.withMemberCapacity(organizationId, write);
  }

  getMemberLimit(organizationId: string): Promise<number> {
    return this.seats.getMemberLimit(organizationId);
  }

  async assertCanCreateResource(
    tx: DatabaseOrTx,
    organizationId: string,
  ): Promise<void> {
    await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .for("update");

    const active = this.config.developmentPlan
      ? null
      : await this.billing.readActiveSubscription(tx, organizationId);
    const limit = resolveEntitlements(
      this.config.developmentPlan ?? active?.planSlug ?? PLAN.free,
    ).limit(LIMIT.maxResources);
    if (limit === Number.MAX_SAFE_INTEGER) return;

    if ((await this.countOrganizationResources(tx, organizationId)) >= limit) {
      throw new OrganizationResourceLimitError(limit);
    }
  }

  syncMemberSeats(
    organizationId: string,
  ): Promise<void> {
    return this.seats.syncMemberSeats(organizationId);
  }

  reconcileAllMemberSeats(): Promise<MemberSeatReconciliationResult> {
    return this.seats.reconcileAllMemberSeats();
  }

  upsertSubscription(params: UpsertSubscriptionParams): Promise<void> {
    return this.billing.upsertSubscription(params);
  }

  private async resolveFeatureAccess(
    plan: PlanSlug,
    user: FeatureAccessUser,
  ): Promise<FeatureAccess> {
    const features = { ...resolvePlanFeatures(plan) };
    if (user.isAnonymous) return resolvePlanFeatures(PLAN.free);
    features[FEATURE.agentWork] = await this.isFeatureApproved(user, plan, FEATURE.agentWork);
    return features;
  }

  private async isFeatureApproved(
    user: FeatureAccessUser,
    plan: PlanSlug,
    flag: string,
  ): Promise<boolean> {
    if (!this.posthog) return false;

    try {
      const flags = await this.posthog.evaluateFlags(user.id, {
        flagKeys: [flag],
        personProperties: { email: user.email, plan },
      });
      return flags.isEnabled(flag);
    } catch (error) {
      log.warn({
        args: [{ error: parseError(error), userId: user.id, flag }],
        context: "EntitlementsService",
        message: "Feature approval check failed closed",
      });
      return false;
    }
  }

  private async countOrganizationResources(
    db: DatabaseOrTx,
    organizationId: string,
  ): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(workspaceResourcesDb)
      .innerJoin(
        workspacesDb,
        eq(workspaceResourcesDb.workspaceId, workspacesDb.id),
      )
      .where(
        and(
          eq(workspacesDb.organizationId, organizationId),
          notExists(
            db
              .select({ id: workspaceResourceTrashDb.id })
              .from(workspaceResourceTrashDb)
              .where(
                eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id),
              ),
          ),
        ),
      );
    return row?.value ?? 0;
  }
}
