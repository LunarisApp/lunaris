import { ListApi } from "@app/utils/openapi";
import { Controller, ForbiddenException, Query } from "@nestjs/common";
import { permission } from "@repo/auth/permissions";
import { isSessionAnonymous } from "@repo/auth/session-utils";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { useLogger } from "evlog/nestjs";
import { RequirePermission } from "../security/permissions/permission.decorator";
import { NoActiveOrganizationError } from "../sync/sync.errors";
import { Audited } from "../audit/recording/audit.decorator";
import {
  AuditEventsListResponseDto,
  AuditEventsQueryDto,
} from "@repo/ee-audit/server/schema";
import { AuditService } from "./audit.service";

@Controller("audit-events")
export class AuditController {
  constructor(private readonly audits: AuditService) {}

  @ListApi({
    paginatedSerializer: AuditEventsListResponseDto,
    operation: {
      summary: "Review compliance audit events for the active organization",
    },
  })
  @RequirePermission(permission.audit.read)
  @Audited("auditEventsRead")
  async list(
    @Session() session: UserSession,
    @Query({ schema: AuditEventsQueryDto }) query: AuditEventsQueryDto
  ): Promise<AuditEventsListResponseDto> {
    const tenantId = session.session.activeOrganizationId;
    if (!tenantId) {
      throw new NoActiveOrganizationError();
    }
    if (isSessionAnonymous(session)) {
      throw new ForbiddenException(
        "Signed-in organization owner required to review audit events"
      );
    }
    useLogger().set({
      organization: { id: tenantId },
      user: { id: session.user.id },
    });
    await this.audits.assertReviewer(session.user.id, tenantId);
    return this.audits.list(tenantId, query);
  }
}
