import { RetrieveApi } from "@app/utils/openapi";
import { Controller } from "@nestjs/common";
import { isSessionAnonymous } from "@repo/auth/session-utils";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { requireActiveOrganization } from "./active-organization";
import { EntitlementSnapshotDto } from "./entitlements.schema";
import { EntitlementsService } from "./entitlements.service";

@Controller("entitlements")
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @RetrieveApi({
    path: "me",
    serializer: EntitlementSnapshotDto,
    operation: { summary: "Get active organization entitlements" },
  })
  async getCurrent(
    @Session() session: UserSession,
  ): Promise<EntitlementSnapshotDto> {
    const organizationId = requireActiveOrganization(session);
    await this.entitlements.assertOrganizationMember(
      session.user.id,
      organizationId,
    );
    return this.entitlements.resolveSnapshotForOrganization({
      organizationId,
      user: {
        email: session.user.email,
        id: session.user.id,
        isAnonymous: isSessionAnonymous(session),
      },
    });
  }
}
