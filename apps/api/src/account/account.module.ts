import { Module } from "@nestjs/common";
import { AvatarController } from "./avatar/account-avatar.controller";
import { AvatarService } from "./avatar/account-avatar.service";
import { AccountDeletionController } from "./deletion/account-deletion.controller";
import { AccountDeletionService } from "./deletion/account-deletion.service";

@Module({
  controllers: [AvatarController, AccountDeletionController],
  providers: [AvatarService, AccountDeletionService],
})
export class AccountModule {}
