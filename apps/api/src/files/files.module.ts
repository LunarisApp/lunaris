import { EntitlementsModule } from "../entitlements/entitlements.module";
import { UploadSessionsService } from "./upload-sessions.service";
import { StorageReconciliationService } from "./storage-reconciliation.service";
import { Module } from "@nestjs/common";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

@Module({
  imports: [EntitlementsModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    UploadSessionsService,
    StorageReconciliationService,
  ],
  exports: [FilesService, UploadSessionsService, StorageReconciliationService],
})
export class FilesModule {}
