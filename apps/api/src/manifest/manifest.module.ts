import { StorageModule } from "@app/storage";
import { Module } from "@nestjs/common";
import { ManifestController } from "./manifest.controller";

@Module({
  imports: [StorageModule],
  controllers: [ManifestController],
})
export class ManifestModule {}
