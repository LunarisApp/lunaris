import { Module } from "@nestjs/common";
import { ExtensionRequestsController } from "./extension-requests.controller";
import { ExtensionRequestsService } from "./extension-requests.service";

@Module({
  controllers: [ExtensionRequestsController],
  providers: [ExtensionRequestsService],
})
export class ExtensionRequestsModule {}
