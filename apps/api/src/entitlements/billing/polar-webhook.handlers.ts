import { Injectable } from "@nestjs/common";
import type { models } from "@polar-sh/sdk/2026-10";
import type { PolarWebhookCallbacks } from "@repo/auth/server";
import { log } from "evlog";
import { useLogger } from "evlog/nestjs";
import { AuditActions } from "../../audit/recording/audit.actions";
import { recordComplianceAudit } from "../../audit/recording/audit-log";
import { SeatService } from "../seats/seat.service";
import { BillingService } from "./billing.service";

type Subscription = models.Subscription;

// Handlers are idempotent — safe for webhook retries.
@Injectable()
export class PolarWebhookHandlers {
  constructor(
    private readonly billing: BillingService,
    private readonly seats: SeatService
  ) {}

  toCallbacks(): PolarWebhookCallbacks {
    return {
      onSubscriptionCreated: async (p) => this.upsert(p.data),
      onSubscriptionUpdated: async (p) => this.upsert(p.data),
      onSubscriptionActive: async (p) => this.upsert(p.data),
      onSubscriptionUncanceled: async (p) => this.upsert(p.data),
      onSubscriptionCanceled: async (p) => this.upsert(p.data),
      onSubscriptionRevoked: async (p) => this.upsert(p.data),
    };
  }

  private async upsert(sub: Subscription): Promise<void> {
    const purchasedByUserId = sub.customer?.external_id;
    const organizationId = sub.metadata.referenceId;
    if (!purchasedByUserId || typeof organizationId !== "string") {
      log.warn({
        context: "PolarWebhookHandlers",
        message:
          "Skipping subscription upsert: organization reference or customer externalId missing",
        args: [{ subscriptionId: sub.id, customerId: sub.customer_id }],
      });
      return;
    }

    const auditLog = useLogger();
    auditLog.set({ organization: { id: organizationId } });
    const auditInput = {
      actor: { id: "polar-webhook", type: "system" as const },
      changes: {
        after: {
          productId: sub.product_id,
          status: sub.status,
        },
      },
      target: { id: sub.id, tenantId: organizationId },
    };
    try {
      await this.billing.upsertSubscription({
        polarSubscriptionId: sub.id,
        organizationId,
        purchasedByUserId,
        productId: sub.product_id,
        status: sub.status,
        currentPeriodEnd: sub.current_period_end
          ? new Date(sub.current_period_end)
          : null,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at) : null,
        modifiedAt: resolveModifiedAt(sub),
      });

      if (sub.status === "active" || sub.status === "trialing") {
        await this.seats.syncMemberSeats(organizationId);
      }
      recordComplianceAudit(
        auditLog,
        AuditActions.billingSubscriptionSynchronized({
          ...auditInput,
          outcome: "success",
        })
      );
    } catch (error) {
      recordComplianceAudit(
        auditLog,
        AuditActions.billingSubscriptionSynchronized({
          ...auditInput,
          outcome: "failure",
          reason:
            error instanceof Error
              ? error.message
              : "Subscription synchronization failed",
        })
      );
      throw error;
    }
  }
}

/**
 * Polar's `subscription.created` webhook payloads can carry `modified_at: null`.
 * Fall back to `created_at` so the ordering guard always has a real timestamp
 * (otherwise the FIRST webhook would write `NULL` and the second — arriving
 * with a real modifiedAt — would always win, even if it's stale).
 */
function resolveModifiedAt(sub: Subscription): Date | null {
  const timestamp = sub.modified_at ?? sub.created_at;
  return timestamp ? new Date(timestamp) : null;
}
