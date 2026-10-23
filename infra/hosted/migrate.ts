import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl:
    process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});
try {
  const client = await pool.connect();
  try {
    // Regions sharing one database must not race the migration journal.
    await client.query(
      "SELECT pg_advisory_lock(hashtext('lunaris'), hashtext('hosted-migrations'))"
    );
    try {
      await migrate(drizzle(client), {
        migrationsFolder: resolve(import.meta.dir, "drizzle"),
      });
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('lunaris'), hashtext('hosted-migrations'))"
      );
    }
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
