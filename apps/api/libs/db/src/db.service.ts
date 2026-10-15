import type { DrizzleDatabase } from "@app/db/utils";
import { Injectable } from "@nestjs/common";
import { InjectDrizzle } from "@nestjs/drizzle";
import type { Pool } from "pg";

@Injectable()
export class DatabaseService {
  readonly pool: Pool;

  constructor(
    @InjectDrizzle() readonly db: DrizzleDatabase & { $client: Pool },
  ) {
    this.pool = db.$client;
  }
}
