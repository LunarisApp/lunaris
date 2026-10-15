import { Module } from "@nestjs/common";
import { AgentControlModule } from "./control/agent-control.module";
import { McpModule } from "./mcp/mcp.module";

@Module({
  imports: [AgentControlModule, McpModule],
})
export class AgentsModule {}
