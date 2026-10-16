import { Injectable } from "@nestjs/common";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import type { PolarWebhookCallbacks } from "@repo/auth/server";
import { log } from "evlog";
import { useLogger } from "evlog/nestjs";
import { AuditActions } from "../../audit/recording/audit.actions";
import { recordComplianceAudit } from "../../audit/recording/audit-log";
import { SeatService } from "../seats/seat.service";
import { BillingService } from "./billing.service";

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
    const purchasedByUserId = sub.customer?.externalId;
    const organizationId = sub.metadata.referenceId;
    if (!purchasedByUserId || typeof organizationId !== "string") {
      log.warn({
        context: "PolarWebhookHandlers",
        message:
          "Skipping subscription upsert: organization reference or customer externalId missing",
        args: [{ subscriptionId: sub.id, customerId: sub.customerId }],
      });
      return;
    }

    const auditLog = useLogger();
    auditLog.set({ organization: { id: organizationId } });
    const auditInput = {
      actor: { id: "polar-webhook", type: "system" as const },
      changes: {
        after: {
          productId: sub.productId,
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
        productId: sub.productId,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd ?? null,
        canceledAt: sub.canceledAt ?? null,
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
 * Polar's `subscription.created` webhook payloads can carry `modifiedAt: null`.
 * Fall back to `createdAt` so the ordering guard always has a real timestamp
 * (otherwise the FIRST webhook would write `NULL` and the second — arriving
 * with a real modifiedAt — would always win, even if it's stale).
 */
function resolveModifiedAt(sub: Subscription): Date | null {
  return sub.modifiedAt ?? sub.createdAt ?? null;
}
