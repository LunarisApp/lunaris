import { Module } from "@nestjs/common";
import { AgentControlModule } from "../control/agent-control.module";
import { McpController } from "./mcp.controller";

@Module({
  imports: [AgentControlModule],
  controllers: [McpController],
})
export class McpModule {}
