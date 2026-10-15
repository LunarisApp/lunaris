import { ActionApi } from "@app/utils/openapi";
import { Controller } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { DeletionRequestResponseDto } from "./account-deletion.schema";
import { AccountDeletionService } from "./account-deletion.service";

@Controller("account")
export class AccountDeletionController {
  constructor(private readonly deletionService: AccountDeletionService) {}

  @ActionApi({
    path: "delete-request",
    serializer: DeletionRequestResponseDto,
    operation: { summary: "Request account deletion" },
  })
  async requestDeletion(
    @Session() session: UserSession,
  ): Promise<DeletionRequestResponseDto> {
    return this.deletionService.requestDeletion(session.user);
  }
}
