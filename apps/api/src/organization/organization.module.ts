import { OrganizationDeletionWorker } from "./deletion/organization-deletion.worker";
import { Module } from "@nestjs/common";
import { ArchiveService } from "./backup/archive.service";
import { BackupController } from "./backup/backup.controller";
import { BackupService } from "./backup/backup.service";
import { BackupWorker } from "./backup/backup.worker";
import { BackupEmailService } from "./backup/email.service";
import { OrganizationDeletionController } from "./deletion/organization-deletion.controller";
import { OrganizationDeletionService } from "./deletion/organization-deletion.service";

@Module({
  controllers: [BackupController, OrganizationDeletionController],
  providers: [
    ArchiveService,
    BackupEmailService,
    BackupService,
    BackupWorker,
    OrganizationDeletionService,
    OrganizationDeletionWorker,
  ],
})
export class OrganizationModule {}
