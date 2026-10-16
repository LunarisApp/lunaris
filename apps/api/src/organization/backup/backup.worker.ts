import { DatabaseService } from "@app/db";
import { POSTHOG_CLIENT } from "@app/posthog";
import { StorageService } from "@app/storage";
import { Inject, Injectable } from "@nestjs/common";
import { Cron, Interval } from "@nestjs/schedule";
import { and, asc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { organization } from "../../auth/auth.entity";
import { createLogger } from "evlog";
import type { PostHog } from "posthog-node";
import { ArchiveService, MissingBackupFileError } from "./archive.service";
import { type BackupExport, backupExportsDb } from "./backup.entity";

const LEASE_DURATION_MS = 2 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const PROGRESS_WRITE_INTERVAL_MS = 1000;

@Injectable()
export class BackupWorker {
  private running = false;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly archiveService: ArchiveService,
    private readonly storage: StorageService,
    @Inject(POSTHOG_CLIENT) private readonly posthog: PostHog | null
  ) {}

  @Interval(5000)
  async processNext() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.recoverExpiredLeases();
      const backup = await this.claimNext();
      if (backup) {
        await this.process(backup);
      }
    } catch (error) {
      const log = createLogger({ task: "backup-poll" });
      log.error(asError(error));
      log.emit();
    } finally {
      this.running = false;
    }
  }

  @Cron("0 * * * *")
  async cleanupExpired() {
    const now = new Date();
    const expired = await this.databaseService.db
      .select()
      .from(backupExportsDb)
      .where(
        and(
          lt(backupExportsDb.expiresAt, now),
          or(
            eq(backupExportsDb.status, "ready"),
            and(
              eq(backupExportsDb.status, "expired"),
              isNotNull(backupExportsDb.objectKey)
            )
          )
        )
      );

    for (const backup of expired) {
      if (backup.objectKey) {
        try {
          await this.storage.deleteObject(backup.objectKey);
        } catch (error) {
          const log = createLogger({ task: "backup-cleanup" });
          log.set({
            backup: { id: backup.id, operation: "delete-expired" },
            organization: { id: backup.organizationId },
          });
          log.error(asError(error));
          log.emit();
          continue;
        }
      }
      await this.databaseService.db
        .update(backupExportsDb)
        .set({
          leaseExpiresAt: null,
          objectKey: null,
          phase: "expired",
          status: "expired",
        })
        .where(eq(backupExportsDb.id, backup.id));
    }
  }

  private async recoverExpiredLeases() {
    const now = new Date();
    await this.databaseService.db
      .update(backupExportsDb)
      .set({ leaseExpiresAt: null, phase: "queued", status: "queued" })
      .where(
        and(
          eq(backupExportsDb.status, "processing"),
          lt(backupExportsDb.leaseExpiresAt, now),
          lt(backupExportsDb.attemptCount, MAX_ATTEMPTS)
        )
      );
    await this.databaseService.db
      .update(backupExportsDb)
      .set({
        failureCode: "attempts_exhausted",
        leaseExpiresAt: null,
        phase: "failed",
        status: "failed",
      })
      .where(
        and(
          eq(backupExportsDb.status, "processing"),
          lt(backupExportsDb.leaseExpiresAt, now),
          eq(backupExportsDb.attemptCount, MAX_ATTEMPTS)
        )
      );
  }

  private claimNext() {
    return this.databaseService.db.transaction(async (tx) => {
      const backup = await tx
        .select()
        .from(backupExportsDb)
        .where(
          and(
            eq(backupExportsDb.status, "queued"),
            sql`EXISTS (SELECT 1 FROM ${organization} WHERE ${organization.id} = ${backupExportsDb.organizationId} AND ${organization.deletionRequestedAt} IS NULL)`
          )
        )
        .orderBy(asc(backupExportsDb.createdAt))
        .limit(1)
        .for("update", { skipLocked: true })
        .then((rows) => rows[0]);
      if (!backup) {
        return null;
      }

      return tx
        .update(backupExportsDb)
        .set({
          attemptCount: backup.attemptCount + 1,
          failureCode: null,
          leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS),
          phase: "snapshotting",
          startedAt: backup.startedAt ?? new Date(),
          status: "processing",
        })
        .where(eq(backupExportsDb.id, backup.id))
        .returning()
        .then((rows) => rows[0]!);
    });
  }

  private async process(backup: BackupExport) {
    const log = createLogger({ task: "backup" });
    log.set({
      backup: { id: backup.id, attempt: backup.attemptCount },
      organization: { id: backup.organizationId },
      user: { id: backup.requestedByUserId },
    });
    const heartbeat = setInterval(() => {
      void this.databaseService.db
        .update(backupExportsDb)
        .set({ leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS) })
        .where(
          and(
            eq(backupExportsDb.id, backup.id),
            eq(backupExportsDb.status, "processing")
          )
        )
        .catch(() => undefined);
    }, HEARTBEAT_INTERVAL_MS);

    let lastProgressWrite = 0;
    try {
      const result = await this.archiveService.createArchive({
        backupId: backup.id,
        organizationId: backup.organizationId,
        userId: backup.requestedByUserId ?? undefined,
        onProgress: async (progress) => {
          const now = Date.now();
          if (
            progress.phase !== "finalizing" &&
            now - lastProgressWrite < PROGRESS_WRITE_INTERVAL_MS
          ) {
            return;
          }
          lastProgressWrite = now;
          await this.databaseService.db
            .update(backupExportsDb)
            .set(progress)
            .where(eq(backupExportsDb.id, backup.id));
        },
      });

      const completedAt = new Date();
      await this.databaseService.db
        .update(backupExportsDb)
        .set({
          archiveSizeBytes: result.archiveSizeBytes,
          completedAt,
          expiresAt: new Date(completedAt.getTime() + RETENTION_MS),
          failureCode: null,
          filename: result.filename,
          leaseExpiresAt: null,
          notificationStatus: "pending",
          objectKey: result.objectKey,
          phase: "ready",
          status: "ready",
        })
        .where(eq(backupExportsDb.id, backup.id));
      log.set({
        backup: {
          archiveSizeBytes: result.archiveSizeBytes,
          files: result.fileCount,
          status: "ready",
        },
      });
      this.posthog?.capture({
        distinctId: backup.requestedByUserId ?? backup.organizationId,
        event: "backup_ready",
        groups: { organization: backup.organizationId },
        properties: {
          archive_size_bytes: result.archiveSizeBytes,
          attempt_count: backup.attemptCount,
          file_count: result.fileCount,
          $process_person_profile: Boolean(backup.requestedByUserId),
        },
      });
    } catch (error) {
      const failureCode =
        error instanceof MissingBackupFileError
          ? "source_file_missing"
          : "generation_failed";
      const retry = backup.attemptCount < MAX_ATTEMPTS;
      await this.databaseService.db
        .update(backupExportsDb)
        .set({
          failureCode,
          leaseExpiresAt: null,
          phase: retry ? "queued" : "failed",
          status: retry ? "queued" : "failed",
        })
        .where(eq(backupExportsDb.id, backup.id));
      log.set({ backup: { failureCode, status: retry ? "queued" : "failed" } });
      log.error(asError(error));
      this.posthog?.capture({
        distinctId: backup.requestedByUserId ?? backup.organizationId,
        event: "backup_attempt_failed",
        groups: { organization: backup.organizationId },
        properties: {
          attempt_count: backup.attemptCount,
          failure_code: failureCode,
          will_retry: retry,
          $process_person_profile: Boolean(backup.requestedByUserId),
        },
      });
      if (error instanceof Error) {
        this.posthog?.captureException(
          error,
          backup.requestedByUserId ?? backup.organizationId,
          {
            failure_code: failureCode,
            $process_person_profile: Boolean(backup.requestedByUserId),
          }
        );
      }
    } finally {
      clearInterval(heartbeat);
      log.emit();
    }
  }
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
