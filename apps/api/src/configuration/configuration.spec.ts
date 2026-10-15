import { describe, expect, it, spyOn } from "bun:test";
import { ConfigService } from "@nestjs/config";
import { DatabaseConfig } from "../../libs/db/src/db.config";
import { PolarConfig } from "../../libs/polar/src/polar.config";
import { RedisConfig } from "../../libs/redis/src/redis.config";
import { AppConfig } from "../app.config";

function config(values: Record<string, unknown>) {
  const service = new ConfigService(values);
  spyOn(service, "get").mockImplementation((key) => values[String(key)]);
  return service;
}

describe("native configuration", () => {
  it("keeps database names, coercion and SSL defaults", () => {
    const values = {
      DATABASE_HOST: "localhost",
      DATABASE_PORT: "5432",
      DATABASE_USER: "user",
      DATABASE_PASSWORD: "secret",
      DATABASE_NAME: "db",
    };
    expect(new DatabaseConfig(config(values))).toMatchObject({
      host: "localhost",
      port: 5432,
      ssl: true,
    });
    expect(
      new DatabaseConfig(config({ ...values, DATABASE_SSL: "false" })).ssl,
    ).toBe(false);
    expect(
      () => new DatabaseConfig(config({ ...values, DATABASE_SSL: "invalid" })),
    ).toThrow();
  });

  it("keeps optional billing and Redis disabled when unset", () => {
    expect(new PolarConfig(config({})).enabled).toBe(false);
    expect(new RedisConfig(config({})).values).toBeUndefined();
    expect(
      () => new RedisConfig(config({ REDIS_HOST: "localhost" })).values,
    ).toThrow("must all be set");
  });

  it("preserves desktop defaults and no longer requires a CSRF secret", () => {
    const values = {
      APP_REGION: "eu",
      FRONTEND_URL: "https://app.example",
      URL: "https://api.example",
      LOCAL_DB_ENCRYPTION_MASTER_KEY: "a".repeat(64),
      POWERSYNC_URL: "https://sync.example",
    };
    const app = new AppConfig(config(values));
    expect(app.desktopAppOrigins).toEqual([
      "lunaris://",
      "tauri://localhost",
      "http://tauri.localhost",
    ]);
    expect(app.nodeEnv).toBe("development");
    expect(
      () =>
        new AppConfig(
          config({ ...values, LOCAL_DB_ENCRYPTION_MASTER_KEY: "bad" }),
        ),
    ).toThrow();
  });
});
