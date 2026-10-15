import { Module } from "@nestjs/common";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { PresenceAccessService } from "./presence-access.service";
import { PresenceController } from "./presence.controller";
import { PresenceGateway } from "./presence.gateway";
import { PresenceRelay } from "./presence-relay";

@Module({
  imports: [WorkspacesModule],
  controllers: [PresenceController],
  providers: [PresenceAccessService, PresenceRelay, PresenceGateway],
})
export class PresenceModule {}
