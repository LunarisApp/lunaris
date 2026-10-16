import { DatabaseService } from "@app/db";
import { StorageService } from "@app/storage";
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { member, organization } from "../../auth/auth.entity";
import { type BackupExport, backupExportsDb } from "./backup.entity";
import type { BackupDownloadResponseDto, BackupDto } from "./backup.schema";

const DOWNLOAD_URL_TTL_SECONDS = 10 * 60;

@Injectable()
export class BackupService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storage: StorageService
  ) {}

  async create(userId: string, organizationId: string) {
    await this.assertOwner(userId, organizationId);

    const backup = await this.databaseService.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`
      );
      const active = await tx
        .select()
        .from(backupExportsDb)
        .where(
          and(
            eq(backupExportsDb.organizationId, organizationId),
            inArray(backupExportsDb.status, ["queued", "processing"])
          )
        )
        .orderBy(desc(backupExportsDb.createdAt))
        .limit(1)
        .then((rows) => rows[0]);
      if (active) {
        return active;
      }

      return tx
        .insert(backupExportsDb)
        .values({ organizationId, requestedByUserId: userId })
        .returning()
        .then((rows) => rows[0]!);
    });

    return toBackupDto(backup);
  }

  async getCurrent(userId: string, organizationId: string) {
    await this.assertOwner(userId, organizationId);
    const backup = await this.databaseService.db
      .select()
      .from(backupExportsDb)
      .where(eq(backupExportsDb.organizationId, organizationId))
      .orderBy(desc(backupExportsDb.createdAt))
      .limit(1)
      .then((rows) => rows[0]);
    if (!backup) {
      return null;
    }
    return toBackupDto(await this.expireIfNeeded(backup));
  }

  async getById(userId: string, organizationId: string, backupId: string) {
    await this.assertOwner(userId, organizationId);
    const backup = await this.findBackup(organizationId, backupId);
    return toBackupDto(await this.expireIfNeeded(backup));
  }

  async getDownloadUrl(
    userId: string,
    organizationId: string,
    backupId: string
  ): Promise<BackupDownloadResponseDto> {
    await this.assertOwner(userId, organizationId);
    const backup = await this.expireIfNeeded(
      await this.findBackup(organizationId, backupId)
    );

    if (backup.status === "expired") {
      throw new GoneException("Organization backup has expired");
    }
    if (
      backup.status !== "ready" ||
      !backup.objectKey ||
      !backup.filename ||
      !backup.expiresAt
    ) {
      throw new ConflictException("Organization backup is not ready");
    }

    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000);
    return {
      downloadUrl: await this.storage.getSignedDownloadUrl(
        backup.objectKey,
        DOWNLOAD_URL_TTL_SECONDS,
        `attachment; filename="${backup.filename}"`
      ),
      expiresAt: expiresAt.toISOString(),
      filename: backup.filename,
    };
  }

  async assertOwner(userId: string, organizationId: string) {
    const result = await this.databaseService.db
      .select({ organizationId: organization.id, role: member.role })
      .from(organization)
      .leftJoin(
        member,
        and(
          eq(member.organizationId, organization.id),
          eq(member.userId, userId)
        )
      )
      .where(eq(organization.id, organizationId))
      .limit(1)
      .then((rows) => rows[0]);

    if (result?.role !== "owner") {
      throw new ForbiddenException(
        "Only organization owners can export organization backups"
      );
    }
  }

  private async findBackup(organizationId: string, backupId: string) {
    const backup = await this.databaseService.db
      .select()
      .from(backupExportsDb)
      .where(
        and(
          eq(backupExportsDb.id, backupId),
          eq(backupExportsDb.organizationId, organizationId)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);
    if (!backup) {
      throw new NotFoundException("Organization backup not found");
    }
    return backup;
  }

  private async expireIfNeeded(backup: BackupExport) {
    if (
      backup.status !== "ready" ||
      !backup.expiresAt ||
      backup.expiresAt.getTime() > Date.now()
    ) {
      return backup;
    }

    return this.databaseService.db
      .update(backupExportsDb)
      .set({ phase: "expired", status: "expired" })
      .where(eq(backupExportsDb.id, backup.id))
      .returning()
      .then(
        (rows) =>
          rows[0] ?? { ...backup, phase: "expired", status: "expired" as const }
      );
  }
}

export function toBackupDto(backup: BackupExport): BackupDto {
  return {
    id: backup.id,
    status: backup.status,
    phase: backup.phase as BackupDto["phase"],
    progress: {
      processedFiles: backup.processedFiles,
      totalFiles: backup.totalFiles,
      processedBytes: backup.processedBytes,
      totalBytes: backup.totalBytes,
    },
    filename: backup.filename,
    archiveSizeBytes: backup.archiveSizeBytes,
    failureCode: backup.failureCode,
    createdAt: backup.createdAt.toISOString(),
    completedAt: backup.completedAt?.toISOString() ?? null,
    expiresAt: backup.expiresAt?.toISOString() ?? null,
  };
}
