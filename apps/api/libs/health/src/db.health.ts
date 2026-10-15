import { DatabaseService } from "@app/db";
import { Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import { createLogger } from "evlog";

@Injectable()
export class DbHealthIndicator {
  constructor(
    private readonly db: DatabaseService,
    private readonly indicator: HealthIndicatorService
  ) {}

  async isHealthy() {
    const check = this.indicator.check("database");
    try {
      await this.db.pool.query("SELECT 1");
      return check.up();
    } catch (error) {
      const log = createLogger({ task: "health-check" });
      log.set({ health: { indicator: "database", status: "down" } });
      log.error(error as Error);
      log.emit();
      return check.down();
    }
  }
}
