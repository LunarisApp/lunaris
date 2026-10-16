import { BillingService } from "../billing/billing.service";
import { DatabaseService } from "@app/db";
import { Injectable } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { createLogger } from "evlog";
import type { PoolClient } from "pg";
import { SeatService } from "./seat.service";

const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000;
const SEAT_RECONCILIATION_LOCK_KEY = 4_271_002;

@Injectable()
export class SeatReconciliationWorker {
  private running = false;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly seats: SeatService,
    private readonly billing: BillingService
  ) {}

  @Interval(RECONCILIATION_INTERVAL_MS)
  async reconcile() {
    if (this.running) {
      return;
    }
    this.running = true;

    const log = createLogger({ task: "organization-seat-reconciliation" });
    let acquired = false;
    let client: PoolClient | undefined;
    let releaseError: Error | undefined;

    try {
      client = await this.databaseService.pool.connect();
      const lock = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS acquired",
        [SEAT_RECONCILIATION_LOCK_KEY]
      );
      acquired = lock.rows[0]?.acquired === true;
      if (!acquired) {
        log.set({ reconciliation: { status: "lock-skipped" } });
        return;
      }

      const subscriptions = await this.billing.reconcileSubscriptions();
      log.set({ subscriptions });
      const result = await this.seats.reconcileAllMemberSeats();
      log.set({ reconciliation: { ...result, status: "complete" } });
    } catch (error) {
      log.set({ reconciliation: { status: "failed" } });
      log.error(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (acquired && client) {
        try {
          await client.query("SELECT pg_advisory_unlock($1)", [
            SEAT_RECONCILIATION_LOCK_KEY,
          ]);
        } catch (error) {
          releaseError =
            error instanceof Error ? error : new Error(String(error));
          log.error(releaseError);
        }
      }
      client?.release(releaseError);
      log.emit();
      this.running = false;
    }
  }
}
