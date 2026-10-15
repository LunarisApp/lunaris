import { sslSchema } from "@app/db/db.config";
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseSslEnabled = sslSchema.parse(process.env.DATABASE_SSL);

export default defineConfig({
  out: "./drizzle",
  schema: "./src/**/*.entity.ts",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    host: process.env.DATABASE_HOST!,
    port: Number(process.env.DATABASE_PORT!),
    user: process.env.DATABASE_USER!,
    password: process.env.DATABASE_PASSWORD!,
    database: process.env.DATABASE_NAME!,
    ssl: databaseSslEnabled ? { rejectUnauthorized: false } : false,
  },
});
