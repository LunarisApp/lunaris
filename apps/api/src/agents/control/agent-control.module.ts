import { Module } from "@nestjs/common";
import { EntitlementsModule } from "../../entitlements";
import { FilesModule } from "../../files/files.module";
import { WorkspacesModule } from "../../workspaces/workspaces.module";
import { AgentAccessGuard } from "./access/agent-access.guard";
import { AgentAuditInterceptor } from "./audit/agent-audit.interceptor";
import { AgentControlController } from "./agent-control.controller";
import { AgentControlService } from "./agent-control.service";
import { BackendControlClientFactory } from "./backend/backend-control.client";
import { BuiltInPluginControlController } from "./plugins/plugin-operations.controller";
import { BuiltInPluginOperationsService } from "./plugins/plugin-operations.service";
import { AgentSafetyService } from "./safety/agent-safety.service";

@Module({
  imports: [EntitlementsModule, FilesModule, WorkspacesModule],
  controllers: [AgentControlController, BuiltInPluginControlController],
  providers: [
    AgentAccessGuard,
    AgentAuditInterceptor,
    AgentControlService,
    AgentSafetyService,
    BackendControlClientFactory,
    BuiltInPluginOperationsService,
  ],
  exports: [
    AgentControlService,
    AgentSafetyService,
    BackendControlClientFactory,
    BuiltInPluginOperationsService,
  ],
})
export class AgentControlModule {}
