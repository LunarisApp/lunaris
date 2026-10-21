import { buildInfo } from "./build-info";
import { DbHealthIndicator } from "@app/health/db.health";
import { StorageHealthIndicator } from "@app/health/storage.health";
import { Controller, Get, Header } from "@nestjs/common";
import type {
  HealthCheckResult,
  HealthIndicatorFunction,
} from "@nestjs/terminus";
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from "@nestjs/terminus";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";

const isProduction = process.env.NODE_ENV === "production";

@AllowAnonymous()
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dbHealth: DbHealthIndicator,
    private readonly storageHealth: StorageHealthIndicator,
    // private readonly disk: DiskHealthIndicator, // Railway manages disk space.
    private readonly memory: MemoryHealthIndicator
  ) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @Header("X-Lunaris-Commit", buildInfo.sha)
  @Header("X-Lunaris-Version", buildInfo.version)
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    const checks: HealthIndicatorFunction[] = [
      () => this.dbHealth.isHealthy(),
      () => this.storageHealth.isHealthy(),
    ];

    if (isProduction) {
      checks.push(
        // () =>
        //   this.disk.checkStorage("disk", {
        //     path: "/",
        //     thresholdPercent: 0.75,
        //   }),
        () => this.memory.checkHeap("memory_heap", 150 * 1024 * 1024)
      );
    }

    return this.health.check(checks);
  }
}
