import { describe, expect, it, mock } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { BackupWorker } from "./backup.worker";

describe("BackupWorker", () => {
  it("skips expired backups whose object was already removed", async () => {
    let cleanupCondition: SQL | undefined;
    const selectBuilder = {
      from: () => selectBuilder,
      where: (condition: SQL) => {
        cleanupCondition = condition;
        return Promise.resolve([]);
      },
    };
    const databaseService = {
      db: { select: mock(() => selectBuilder) },
    };
    const worker = new BackupWorker(
      databaseService as never,
      {} as never,
      {} as never,
      null
    );

    await worker.cleanupExpired();

    expect(cleanupCondition).toBeDefined();
    const query = new PgDialect().sqlToQuery(cleanupCondition!);
    expect(query.params.slice(1)).toEqual(["ready", "expired"]);
    expect(query.sql).toContain('"backup_exports"."expiresAt" < $1');
    expect(query.sql).toContain(
      '("backup_exports"."status" = $2 or ("backup_exports"."status" = $3 and "backup_exports"."objectKey" is not null))'
    );
  });
});
