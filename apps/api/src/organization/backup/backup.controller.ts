import { ActionApi, RetrieveApi } from "@app/utils/openapi";
import { Controller, Param } from "@nestjs/common";
import { permission } from "@repo/auth/permissions";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { RequirePermission } from "../../security/permissions/permission.decorator";
import { NoActiveOrganizationError } from "../../sync/sync.errors";
import {
  BackupDownloadResponseDto,
  BackupDto,
  CurrentBackupResponseDto,
} from "./backup.schema";
import { BackupService } from "./backup.service";

@Controller("organization/backups")
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @ActionApi({
    serializer: BackupDto,
    operation: { summary: "Create an organization backup export" },
  })
  @RequirePermission(permission.backup.create)
  create(@Session() session: UserSession): Promise<BackupDto> {
    return this.backups.create(
      session.user.id,
      requireActiveOrganization(session)
    );
  }

  @RetrieveApi({
    path: "current",
    serializer: CurrentBackupResponseDto,
    operation: { summary: "Get current organization backup export" },
  })
  @RequirePermission(permission.backup.read)
  async getCurrent(
    @Session() session: UserSession
  ): Promise<CurrentBackupResponseDto> {
    return {
      backup: await this.backups.getCurrent(
        session.user.id,
        requireActiveOrganization(session)
      ),
    };
  }

  @RetrieveApi({
    path: ":id/download-url",
    serializer: BackupDownloadResponseDto,
    operation: { summary: "Get organization backup download URL" },
  })
  @RequirePermission(permission.backup.read)
  getDownloadUrl(
    @Session() session: UserSession,
    @Param("id") id: string
  ): Promise<BackupDownloadResponseDto> {
    return this.backups.getDownloadUrl(
      session.user.id,
      requireActiveOrganization(session),
      id
    );
  }

  @RetrieveApi({
    path: ":id",
    serializer: BackupDto,
    operation: { summary: "Get an organization backup export" },
  })
  @RequirePermission(permission.backup.read)
  getById(
    @Session() session: UserSession,
    @Param("id") id: string
  ): Promise<BackupDto> {
    return this.backups.getById(
      session.user.id,
      requireActiveOrganization(session),
      id
    );
  }
}

function requireActiveOrganization(session: UserSession) {
  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) {
    throw new NoActiveOrganizationError();
  }
  return organizationId;
}
