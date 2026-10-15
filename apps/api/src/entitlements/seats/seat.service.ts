import type { DatabaseOrTx } from "@app/db/utils";
import { lockOrganizationCapacity, readOrganizationOccupancy, releaseAcceptedReservations } from "./organization-capacity";
import { DatabaseService } from "@app/db";
import { POLAR_CLIENT } from "@app/polar";
import { Inject, Injectable } from "@nestjs/common";
import type { Polar } from "@polar-sh/sdk";
import { LIMIT, PLAN, resolveEntitlements } from "@repo/auth/entitlements";
import { count, eq, inArray } from "drizzle-orm";
import { log, parseError } from "evlog";
import { member } from "../../auth/auth.entity";
import { BillingService } from "../billing/billing.service";
import { subscription } from "../billing/subscription.entity";
import { EntitlementsConfig } from "../core/entitlements.config";
import {
  OrganizationPlanMemberLimitError,
  OrganizationSubscriptionConflictError,
} from "../core/entitlements.errors";

const ACCESS_STATUSES = ["active", "trialing"];
// Leave room in the default 10-connection pool for API traffic and the
// reconciliation worker's connection-scoped advisory lock.
const SEAT_RECONCILIATION_BATCH_SIZE = 2;

export interface MemberSeatReconciliationResult {
  checked: number;
  failed: number;
  updated: number;
}

@Injectable()
export class SeatService {
  constructor(
    private readonly dbService: DatabaseService,
    @Inject(POLAR_CLIENT) private readonly polar: Polar | null,
    private readonly config: EntitlementsConfig,
    private readonly billing: BillingService,
  ) {}

  async hasMemberCapacity(
    organizationId: string,
    options: { includePendingInvitations: boolean },
  ): Promise<boolean> {
    const limit = await this.getMemberLimit(organizationId);
    if (limit === Number.MAX_SAFE_INTEGER) return true;

    const occupancy = await readOrganizationOccupancy(this.dbService.db, organizationId);
    const occupied = occupancy.members + (options.includePendingInvitations ? occupancy.pendingInvitations : 0);
    return occupied < limit;
  }

  async withMemberCapacity<T>(organizationId: string, write: (tx: DatabaseOrTx) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(async (tx) => {
      await lockOrganizationCapacity(tx, organizationId);
      const limit = await this.getMemberLimit(organizationId, tx);
      const before = await readOrganizationOccupancy(tx, organizationId);
      const result = await write(tx);
      await releaseAcceptedReservations(tx, organizationId);
      const after = await readOrganizationOccupancy(tx, organizationId);
      const beforeTotal = before.members + before.pendingInvitations;
      const afterTotal = after.members + after.pendingInvitations;
      if ((after.members > limit && after.members > before.members) ||
          (afterTotal > limit && afterTotal > beforeTotal)) {
        throw new OrganizationPlanMemberLimitError(limit);
      }
      return result;
    });
  }

  async getMemberLimit(organizationId: string, db: DatabaseOrTx = this.dbService.db): Promise<number> {
    const developmentPlan = this.config.developmentPlan;
    const active = developmentPlan
      ? null
      : await this.billing.readActiveSubscription(
          db,
          organizationId,
        );
    return resolveEntitlements(
      developmentPlan ?? active?.planSlug ?? PLAN.free,
    ).limit(LIMIT.maxMembers);
  }

  async syncMemberSeats(organizationId: string): Promise<void> {
    await this.synchronizeMemberSeats(organizationId);
  }

  private async synchronizeMemberSeats(organizationId: string): Promise<boolean> {
    if (!this.polar) return false;
    const polar = this.polar;
    return this.dbService.db.transaction(async (tx) => {
      // Shared with every member write and plan change. Counts cannot change
      // while Polar is being updated; concurrent callbacks read fresh state.
      await lockOrganizationCapacity(tx, organizationId);
      const active = await this.billing.readActiveSubscription(tx, organizationId);
      if (!active || active.planSlug === PLAN.free) return false;
      const remote = await polar.subscriptions.get({ id: active.id });
      if (remote.metadata.referenceId !== organizationId) {
        throw new OrganizationSubscriptionConflictError("Polar subscription organization reference changed");
      }
      if (!ACCESS_STATUSES.includes(remote.status)) return false;
      const [row] = await tx.select({ value: count() }).from(member)
        .where(eq(member.organizationId, organizationId));
      const seats = Math.max(1, row?.value ?? 0);
      if (remote.seats === seats) return false;
      await polar.subscriptions.update({
        id: active.id,
        subscriptionUpdate: { prorationBehavior: "prorate", seats },
      });
      return true;
    });
  }

  async reconcileAllMemberSeats(): Promise<MemberSeatReconciliationResult> {
    if (!this.polar) return { checked: 0, failed: 0, updated: 0 };

    const organizations = await this.dbService.db
      .select({
        organizationId: subscription.organizationId,
        polarSubscriptionId: subscription.polarSubscriptionId,
      })
      .from(subscription)
      .where(inArray(subscription.status, ACCESS_STATUSES));

    let failed = 0;
    let updated = 0;

    for (
      let offset = 0;
      offset < organizations.length;
      offset += SEAT_RECONCILIATION_BATCH_SIZE
    ) {
      const batch = organizations.slice(
        offset,
        offset + SEAT_RECONCILIATION_BATCH_SIZE,
      );
      const results = await Promise.all(
        batch.map(async (organization) => {
          try {
            return await this.reconcileOrganizationMemberSeats(organization);
          } catch (error) {
            log.error({
              args: [{
                error: parseError(error),
                organizationId: organization.organizationId,
                subscriptionId: organization.polarSubscriptionId,
              }],
              context: "SeatService",
              message: "Failed to reconcile organization subscription seats",
            });
            return "failed" as const;
          }
        }),
      );
      failed += results.filter((result) => result === "failed").length;
      updated += results.filter((result) => result === "updated").length;
    }

    return { checked: organizations.length, failed, updated };
  }

  private async reconcileOrganizationMemberSeats(organization: {
    organizationId: string;
  }): Promise<"unchanged" | "updated"> {
    return await this.synchronizeMemberSeats(organization.organizationId) ? "updated" : "unchanged";
  }
}
