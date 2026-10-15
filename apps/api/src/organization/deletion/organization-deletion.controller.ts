import { ActionApi } from "@app/utils/openapi";
import { Body, Controller } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import {
  OrganizationDeletionRequestDto,
  OrganizationDeletionResponseDto,
  OrganizationDeletionTargetDto,
} from "./organization-deletion.schema";
import { OrganizationDeletionService } from "./organization-deletion.service";

// Membership/ownership checked against body organization, including suspended orgs.
@Controller("organization")
export class OrganizationDeletionController {
  constructor(private readonly deletionService: OrganizationDeletionService) {}

  @ActionApi({
    path: "delete-request",
    serializer: OrganizationDeletionResponseDto,
    operation: { summary: "Schedule organization deletion in 30 days" },
  })
  requestDeletion(
    @Session() session: UserSession,
    @Body({ schema: OrganizationDeletionRequestDto })
    body: OrganizationDeletionRequestDto,
  ) {
    return this.deletionService.requestDeletion(
      session.user,
      body.organizationId,
      body.confirmationSlug,
      session.session.createdAt,
    );
  }

  @ActionApi({
    path: "deletion-status",
    serializer: OrganizationDeletionResponseDto,
    operation: { summary: "Read organization deletion status" },
  })
  status(
    @Session() session: UserSession,
    @Body({ schema: OrganizationDeletionTargetDto })
    body: OrganizationDeletionTargetDto,
  ) {
    return this.deletionService.getStatus(session.user.id, body.organizationId);
  }

  @ActionApi({
    path: "restore",
    serializer: OrganizationDeletionResponseDto,
    operation: { summary: "Cancel scheduled organization deletion" },
  })
  restore(
    @Session() session: UserSession,
    @Body({ schema: OrganizationDeletionTargetDto })
    body: OrganizationDeletionTargetDto,
  ) {
    return this.deletionService.restore(session.user.id, body.organizationId);
  }
}
