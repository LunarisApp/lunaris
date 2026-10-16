import { UploadSessionsService } from "./upload-sessions.service";
import { ActionApi, DeleteApi, RetrieveApi } from "@app/utils/openapi";
import { Body, Controller, Param, Query } from "@nestjs/common";
import { permission } from "@repo/auth/permissions";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { useLogger } from "evlog/nestjs";
import {
  DeferPermissionCheck,
  RequirePermission,
} from "../security/permissions/permission.decorator";
import { NoActiveOrganizationError } from "../sync/sync.errors";
import {
  DeleteFileResponseDto,
  FileDownloadUrlResponseDto,
  CreateUploadSessionDto,
  SignUploadPartDto,
  UploadSessionResponseDto,
  UploadPartResponseDto,
  UploadSessionStateDto,
  FileUrlQueryDto,
} from "./files.schema";
import { FilesService } from "./files.service";

@Controller("files")
@DeferPermissionCheck()
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly uploads: UploadSessionsService
  ) {}

  @ActionApi({
    path: "upload-sessions",
    serializer: UploadSessionResponseDto,
    operation: {
      summary: "Reserve organization storage and create or resume an upload",
    },
  })

  @RequirePermission(permission.content.write)
  createUpload(
    @Session() session: UserSession,
    @Body({ schema: CreateUploadSessionDto }) body: CreateUploadSessionDto
  ) {
    return this.uploads.create(
      {
        organizationId: requireActiveOrganization(session),
        userId: session.user.id,
      },
      body
    );
  }

  @RetrieveApi({
    path: "upload-sessions/:id",
    serializer: UploadSessionResponseDto,
    operation: { summary: "Resume a file upload" },
  })
  @RequirePermission(permission.content.write)
  resumeUpload(@Session() session: UserSession, @Param("id") id: string) {
    return this.uploads.resume(
      {
        organizationId: requireActiveOrganization(session),
        userId: session.user.id,
      },
      id
    );
  }

  @ActionApi({
    path: "upload-sessions/:id/parts",
    serializer: UploadPartResponseDto,
    operation: { summary: "Sign one exact-length multipart upload part" },
  })

  @RequirePermission(permission.content.write)
  signPart(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body({ schema: SignUploadPartDto }) body: SignUploadPartDto
  ) {
    return this.uploads.signPart(
      {
        organizationId: requireActiveOrganization(session),
        userId: session.user.id,
      },
      id,
      body.partNumber
    );
  }

  @ActionApi({
    path: "upload-sessions/:id/complete",
    serializer: UploadSessionStateDto,
    operation: { summary: "Verify and complete a file upload" },
  })

  @RequirePermission(permission.content.write)
  completeUpload(@Session() session: UserSession, @Param("id") id: string) {
    return this.uploads.complete(
      {
        organizationId: requireActiveOrganization(session),
        userId: session.user.id,
      },
      id
    );
  }

  @ActionApi({
    path: "upload-sessions/:id/cancel",
    serializer: UploadSessionStateDto,
    operation: {
      summary: "Cancel a file upload and release its reservation after cleanup",
    },
  })

  @RequirePermission(permission.content.write)
  cancelUpload(@Session() session: UserSession, @Param("id") id: string) {
    return this.uploads.cancel(
      {
        organizationId: requireActiveOrganization(session),
        userId: session.user.id,
      },
      id
    );
  }

  @RetrieveApi({
    path: ":fileId/download-url",
    serializer: FileDownloadUrlResponseDto,
    operation: {
      summary: "Get presigned download URL for workspace file storage",
    },
  })
  @RequirePermission(permission.content.read)
  getDownloadUrl(
    @Session() session: UserSession,
    @Param("fileId") fileId: string,
    @Query({ schema: FileUrlQueryDto }) query: FileUrlQueryDto
  ): Promise<FileDownloadUrlResponseDto> {
    const organizationId = requireActiveOrganization(session);
    useLogger().set({
      user: { id: session.user.id },
      organization: { id: organizationId },
      file: {
        operation: "download-url",
        workspaceId: query.workspaceId,
        fileId,
      },
    });
    return this.files.getDownloadUrl({
      fileId,
      fileExtension: query.fileExtension,
      filename: query.filename,
      organizationId,
      workspaceId: query.workspaceId,
      userId: session.user.id,
    });
  }

  @DeleteApi({
    path: ":fileId",
    operation: { summary: "Delete a file from workspace file storage" },
  })

  @RequirePermission(permission.content.delete)
  deleteFile(
    @Session() session: UserSession,
    @Param("fileId") fileId: string,
    @Query({ schema: FileUrlQueryDto }) query: FileUrlQueryDto
  ): Promise<DeleteFileResponseDto> {
    const organizationId = requireActiveOrganization(session);
    useLogger().set({
      user: { id: session.user.id },
      organization: { id: organizationId },
      file: {
        operation: "delete",
        workspaceId: query.workspaceId,
        fileId,
      },
    });
    return this.files.deleteFile({
      fileId,
      fileExtension: query.fileExtension,
      filename: query.filename,
      organizationId,
      workspaceId: query.workspaceId,
      userId: session.user.id,
    });
  }
}

function requireActiveOrganization(session: UserSession) {
  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) {
    throw new NoActiveOrganizationError();
  }
  return organizationId;
}
