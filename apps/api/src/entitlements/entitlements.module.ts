import { PolarConfig } from "@app/polar";
import { Module } from "@nestjs/common";
import { createPlans } from "@repo/auth/billing";
import { BillingController } from "./billing/billing.controller";
import { BillingService } from "./billing/billing.service";
import { PLAN_DEFINITIONS } from "./billing/plan-definitions.token";
import { PolarWebhookHandlers } from "./billing/polar-webhook.handlers";
import { EntitlementsController } from "./core/entitlements.controller";
import { EntitlementsService } from "./core/entitlements.service";
import { SeatReconciliationWorker } from "./seats/seat-reconciliation.worker";
import { SeatService } from "./seats/seat.service";

const planDefinitionsProvider = {
  provide: PLAN_DEFINITIONS,
  inject: [PolarConfig],
  useFactory: (polarConfig: PolarConfig) => {
    const polarValues = polarConfig.values;
    if (!polarValues) {
      return [];
    }
    return createPlans(polarValues.productIds);
  },
};

@Module({
  controllers: [BillingController, EntitlementsController],
  providers: [
    planDefinitionsProvider,
    BillingService,
    EntitlementsService,
    PolarWebhookHandlers,
    SeatReconciliationWorker,
    SeatService,
  ],
  exports: [
    PLAN_DEFINITIONS,
    EntitlementsService,
    PolarWebhookHandlers,
    BillingService,
  ],
})
export class EntitlementsModule {}
