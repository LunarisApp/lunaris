import { StorageService } from "@app/storage";
import { Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import { createLogger } from "evlog";

@Injectable()
export class StorageHealthIndicator {
	constructor(
		private readonly storage: StorageService,
		private readonly indicator: HealthIndicatorService,
	) {}

	async isHealthy() {
		const check = this.indicator.check("storage_bucket");
		try {
			await this.storage.verifyBucket();
			return check.up();
		} catch (error) {
			const log = createLogger({ task: "health-check" });
			log.set({ health: { indicator: "storage_bucket", status: "down" } });
			log.error(error as Error);
			log.emit();
			return check.down();
		}
	}
}
