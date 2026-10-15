import { Module } from "@nestjs/common";
import { EntitlementsModule } from "../entitlements";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";

@Module({
  imports: [EntitlementsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
