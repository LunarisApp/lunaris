import { describe, expect, it, spyOn } from "bun:test";
import { Injectable, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DrizzleModule } from "@nestjs/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { AuditService } from "../../../src/enterprise/audit.service";
import { appDrain } from "../../../src/instrument";
import { DatabaseService } from "./db.service";

// No connection is opened until the first query; real pg pools still exercise ownership.
@Injectable()
class PendingWork {
  complete = false;
  async onApplicationShutdown() {
    await Promise.resolve();
    this.complete = true;
  }
}

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: () => ({
        drizzle,
        connection: { database: "lifecycle_test" },
        casing: "snake_case" as const,
      }),
    }),
  ],
  providers: [DatabaseService, PendingWork],
})
class DatabaseTestModule {}

@Injectable()
class LateAudit {
  async beforeApplicationShutdown() {
    await appDrain({
      event: {
        level: "info",
        service: "api",
        environment: "test",
        timestamp: new Date().toISOString(),
        audit: {
          version: 1,
          action: "workspace.deleted",
          outcome: "success",
          actor: { id: "user_1", type: "user" },
          target: { id: "workspace_1", type: "workspace" },
          context: { requestId: "late-request", tenantId: "organization_1" },
          idempotencyKey: "late-audit",
        },
      },
    });
  }
}

@Module({
  imports: [DatabaseTestModule],
  providers: [DatabaseService, AuditService, LateAudit],
})
class AuditShutdownModule {}

describe("native Drizzle lifecycle", () => {
  it("keeps auditing through HTTP teardown and drains before pool closure", async () => {
    const app = await NestFactory.createApplicationContext(
      AuditShutdownModule,
      { logger: false },
    );
    const database = app.get(DatabaseService);
    let persisted = false;
    const insert = spyOn(database.db, "insert").mockImplementation(
      () =>
        ({
          values: () => ({
            onConflictDoNothing: async () => {
              persisted = true;
            },
          }),
        }) as never,
    );
    const end = database.pool.end.bind(database.pool);
    spyOn(database.pool, "end").mockImplementation(async () => {
      expect(persisted).toBe(true);
      await end();
    });
    try {
      await app.close();
    } finally {
      insert.mockRestore();
    }
    expect(persisted).toBe(true);
  });

  it("owns one independent pool per app and closes it once after pending teardown", async () => {
    const first = await NestFactory.createApplicationContext(
      DatabaseTestModule,
      { logger: false },
    );
    const second = await NestFactory.createApplicationContext(
      DatabaseTestModule,
      { logger: false },
    );
    const firstPool = first.get(DatabaseService).pool;
    const secondPool = second.get(DatabaseService).pool;
    expect(firstPool).toBe(first.get(DatabaseService).db.$client);
    expect(secondPool).not.toBe(firstPool);
    const originalEnd = firstPool.end.bind(firstPool);
    const firstEnd = spyOn(firstPool, "end").mockImplementation(async () => {
      expect(first.get(PendingWork).complete).toBe(true);
      await originalEnd();
    });
    const secondEnd = spyOn(secondPool, "end");
    try {
      await first.close();
      expect(first.get(PendingWork).complete).toBe(true);
      expect(firstEnd).toHaveBeenCalledTimes(1);
      expect(secondEnd).not.toHaveBeenCalled();
    } finally {
      await second.close();
    }
    expect(secondEnd).toHaveBeenCalledTimes(1);
  });
});
