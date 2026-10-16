import { ActionApi } from "@app/utils/openapi";
import { Body, Controller, Get, Param, Redirect } from "@nestjs/common";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import {
  ConfirmRequestDto,
  ConfirmResponseDto,
  UploadUrlRequestDto,
  UploadUrlResponseDto,
} from "./account-avatar.schema";
import { AvatarService } from "./account-avatar.service";

@Controller("account/avatar")
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  @Get(":userId")
  @Redirect()
  @ApiExcludeEndpoint()
  async getAvatar(@Param("userId") userId: string) {
    const url = await this.avatarService.getSignedAvatarUrl(userId);
    return { url, statusCode: 302 };
  }

  @ActionApi({
    path: "upload-url",
    serializer: UploadUrlResponseDto,
    operation: { summary: "Get presigned upload URL for avatar" },
  })
  async getUploadUrl(
    @Session() session: UserSession,
    @Body({ schema: UploadUrlRequestDto }) body: UploadUrlRequestDto
  ): Promise<UploadUrlResponseDto> {
    return this.avatarService.getUploadUrl(session.user.id, body.resource);
  }

  @ActionApi({
    path: "confirm",
    serializer: ConfirmResponseDto,
    operation: { summary: "Confirm avatar upload" },
  })
  async confirmUpload(
    @Session() session: UserSession,
    @Body({ schema: ConfirmRequestDto }) body: ConfirmRequestDto
  ): Promise<ConfirmResponseDto> {
    return this.avatarService.confirmUpload(session.user.id, body.key);
  }
}
