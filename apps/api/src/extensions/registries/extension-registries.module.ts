import { Module } from "@nestjs/common";
import { WorkspacesModule } from "../../workspaces/workspaces.module";
import { ExtensionRegistriesController } from "./extension-registries.controller";
import { ExtensionRegistriesService } from "./extension-registries.service";

@Module({
  imports: [WorkspacesModule],
  controllers: [ExtensionRegistriesController],
  providers: [ExtensionRegistriesService],
})
export class ExtensionRegistriesModule {}
