import { describe, expect, it, mock } from "bun:test";
import { ForbiddenException } from "@nestjs/common";
import type { BackupExport } from "./backup.entity";
import {
  BackupService,
  toBackupDto,
} from "./backup.service";

function makeDatabase(selectResults: unknown[][]) {
  const queue = [...selectResults];
  return {
    db: {
      select: mock(() => {
        const builder = {
          from: () => builder,
          leftJoin: () => builder,
          where: () => builder,
          limit: () => builder,
          then: (resolve: (rows: unknown[]) => unknown) =>
            Promise.resolve(queue.shift() ?? []).then(resolve),
        };
        return builder;
      }),
    },
  };
}

function backup(overrides: Partial<BackupExport> = {}) {
  return {
    id: "backup_1",
    organizationId: "org_1",
    requestedByUserId: "user_1",
    status: "ready",
    phase: "ready",
    processedFiles: 2,
    totalFiles: 2,
    processedBytes: 10,
    totalBytes: 10,
    objectKey: "backups/org_1/backup_1.zip",
    filename: "acme-backup.zip",
    archiveSizeBytes: 8,
    failureCode: null,
    attemptCount: 1,
    leaseExpiresAt: null,
    notificationStatus: "sent",
    notificationAttempts: 1,
    notificationLastAttemptAt: new Date(),
    createdAt: new Date("2026-07-15T10:00:00.000Z"),
    startedAt: new Date("2026-07-15T10:00:01.000Z"),
    completedAt: new Date("2026-07-15T10:01:00.000Z"),
    expiresAt: new Date(Date.now() + 60_000),
    updatedAt: new Date("2026-07-15T10:01:00.000Z"),
    ...overrides,
  } as BackupExport;
}

describe("BackupService", () => {
  it("allows owners and rejects admins", async () => {
    const ownerService = new BackupService(
      makeDatabase([[{ organizationId: "org_1", role: "owner" }]]) as never,
      {} as never,
    );
    await expect(ownerService.assertOwner("user_1", "org_1")).resolves.toBeUndefined();

    const adminService = new BackupService(
      makeDatabase([[{ organizationId: "org_1", role: "editor" }]]) as never,
      {} as never,
    );
    await expect(adminService.assertOwner("user_1", "org_1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("signs a short-lived attachment URL for a ready backup", async () => {
    const getSignedDownloadUrl = mock(() =>
      Promise.resolve("https://storage.test/signed"),
    );
    const service = new BackupService(
      makeDatabase([
        [{ organizationId: "org_1", role: "owner" }],
        [backup()],
      ]) as never,
      { getSignedDownloadUrl } as never,
    );

    const result = await service.getDownloadUrl("user_1", "org_1", "backup_1");

    expect(result.filename).toBe("acme-backup.zip");
    expect(getSignedDownloadUrl).toHaveBeenCalledWith(
      "backups/org_1/backup_1.zip",
      600,
      'attachment; filename="acme-backup.zip"',
    );
  });

  it("serializes dates and progress without internal notification fields", () => {
    const dto = toBackupDto(backup());
    expect(dto.createdAt).toBe("2026-07-15T10:00:00.000Z");
    expect(dto.progress.totalFiles).toBe(2);
    expect(dto).not.toHaveProperty("notificationStatus");
    expect(dto).not.toHaveProperty("objectKey");
  });
});
