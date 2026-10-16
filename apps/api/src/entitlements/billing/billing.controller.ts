import { ActionApi, RetrieveApi } from "@app/utils/openapi";
import { Body, Controller } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { seconds, Throttle } from "@nestjs/throttler";
import { permission } from "@repo/auth/permissions";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { RequirePermission } from "../../security/permissions/permission.decorator";
import { requireActiveOrganization } from "../core/active-organization";
import {
  BillingCheckoutResponseDto,
  BillingPlanChangeResponseDto,
  BillingPlanRequestDto,
  BillingPortalResponseDto,
  BillingStateResponseDto,
} from "./billing.schema";
import { BillingService } from "./billing.service";

@Controller("entitlements")
@ApiTags("Entitlements")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @ActionApi({
    path: "checkout",
    serializer: BillingCheckoutResponseDto,
    operation: {
      operationId: "EntitlementsController_createCheckout_v1",
      summary: "Create an organization plan checkout",
    },
  })
  @RequirePermission(permission.billing.update)

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  createCheckout(
    @Session() session: UserSession,
    @Body({ schema: BillingPlanRequestDto }) body: BillingPlanRequestDto
  ): Promise<BillingCheckoutResponseDto> {
    return this.billing.createCheckout({
      ...body,
      organizationId: requireActiveOrganization(session),
      user: {
        email: session.user.email,
        id: session.user.id,
        name: session.user.name,
      },
    });
  }

  @ActionApi({
    path: "portal",
    serializer: BillingPortalResponseDto,
    operation: {
      operationId: "EntitlementsController_createPortal_v1",
      summary: "Open organization billing portal",
    },
  })
  @RequirePermission(permission.billing.update)

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  createPortal(
    @Session() session: UserSession
  ): Promise<BillingPortalResponseDto> {
    return this.billing.createPortal({
      organizationId: requireActiveOrganization(session),
      userId: session.user.id,
    });
  }

  @ActionApi({
    path: "change-plan",
    serializer: BillingPlanChangeResponseDto,
    operation: {
      operationId: "EntitlementsController_changePlan_v1",
      summary: "Change the active organization plan",
    },
  })
  @RequirePermission(permission.billing.update)

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  async changePlan(
    @Session() session: UserSession,
    @Body({ schema: BillingPlanRequestDto }) body: BillingPlanRequestDto
  ): Promise<BillingPlanChangeResponseDto> {
    await this.billing.changePlan({
      ...body,
      organizationId: requireActiveOrganization(session),
      userId: session.user.id,
    });
    return { success: true };
  }

  @RetrieveApi({
    path: "billing",
    serializer: BillingStateResponseDto,
    operation: {
      operationId: "EntitlementsController_getBillingState_v1",
      summary: "Get active organization billing state",
    },
  })
  @RequirePermission(permission.billing.read)
  getBillingState(
    @Session() session: UserSession
  ): Promise<BillingStateResponseDto> {
    return this.billing.getBillingState({
      organizationId: requireActiveOrganization(session),
      userId: session.user.id,
    });
  }
}
