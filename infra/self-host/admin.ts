import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";
import { resetLocalPassword } from "@repo/auth/admin-password";
import { createAuth } from "@repo/auth/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { createLogger, initLogger } from "evlog";
import { Pool } from "pg";
import { authSchema } from "./dist/src/auth/auth.entity";

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: false,
  max: 1,
});
let exitCode = 1;
let auditFile: number | undefined;
let auditWritten = false;
try {
  auditFile = openSync("/data/admin-audit.jsonl", "a", 0o600);
  const descriptor = auditFile;
  initLogger({
    drain: ({ event }) => {
      if (event.audit) {
        writeSync(descriptor, `${JSON.stringify(event)}\n`);
        fsyncSync(descriptor);
        auditWritten = true;
      }
    },
  });
  const log = createLogger({ task: "local-password-recovery" });
  const email = process.argv[2];
  if (!email) {
    throw new Error("Email required.");
  }
  const password = await Bun.stdin.text();
  const origin = process.env.PUBLIC_URL ?? "http://localhost:8080";
  const auth = createAuth(drizzle(pool), {
    schema: authSchema,
    backendUrl: origin,
    frontendUrl: origin,
    redisConfig: {
      host: process.env.REDIS_HOST ?? "127.0.0.1",
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
    },
  });
  try {
    const userId = await resetLocalPassword(auth, email, password);
    log.audit({
      action: "auth.admin.password_reset",
      actor: { type: "system", id: "container-admin" },
      target: { type: "user", id: userId },
      outcome: "success",
    });
    log.emit();
    if (auditWritten) {
      process.stdout.write("Password reset. Existing sessions revoked.\n");
      exitCode = 0;
    } else {
      process.stderr.write(
        "Password reset and sessions revoked, but audit persistence failed. Check disk space and permissions.\n"
      );
    }
  } catch {
    log.audit({
      action: "auth.admin.password_reset",
      actor: { type: "system", id: "container-admin" },
      outcome: "failure",
    });
    log.emit();
    process.stderr.write(
      "Recovery failed. Check email, password policy, and database/Redis availability. Account must already have password login.\n"
    );
  }
} catch {
  process.stderr.write(
    "Recovery could not complete. Check configuration and audit-file permissions.\n"
  );
} finally {
  await pool.end();
  if (auditFile !== undefined) {
    closeSync(auditFile);
  }
}
// The auth Redis client is private to Better Auth and has no disposal API.
process.exit(exitCode);
