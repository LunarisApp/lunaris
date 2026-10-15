import { DbHealthIndicator } from "@app/health/db.health";
import { HealthController } from "@app/health/health.controller";
import { StorageHealthIndicator } from "@app/health/storage.health";
import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DbHealthIndicator, StorageHealthIndicator],
})
export class HealthModule {}
