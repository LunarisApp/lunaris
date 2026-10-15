import { Module } from "@nestjs/common";
import { ExtensionRegistriesModule } from "./registries/extension-registries.module";
import { ExtensionRequestsModule } from "./requests/extension-requests.module";

@Module({
  imports: [ExtensionRegistriesModule, ExtensionRequestsModule],
})
export class ExtensionsModule {}
