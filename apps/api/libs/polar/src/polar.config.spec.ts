import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "bun:test";
import { PolarConfig } from "./polar.config";

function makeConfig({
  disabled,
  nodeEnv,
  token = "token",
}: {
  disabled: boolean;
  nodeEnv: string;
  token?: string;
}) {
  const config = new PolarConfig(new ConfigService());
  Object.assign(config as unknown as Record<string, unknown>, {
    _accessToken: token,
    _businessMonthlyProductId: "business-monthly",
    _businessYearlyProductId: "business-yearly",
    _nodeEnv: nodeEnv,
    _plusMonthlyProductId: "plus-monthly",
    _plusYearlyProductId: "plus-yearly",
    _webhookSecret: "secret",
    disabled,
  });
  return config;
}

describe("PolarConfig.enabled", () => {
  it("disables Polar locally when requested", () => {
    expect(makeConfig({ disabled: true, nodeEnv: "development" }).enabled).toBe(
      false
    );
  });

  it("ignores local disable flag in production", () => {
    expect(makeConfig({ disabled: true, nodeEnv: "production" }).enabled).toBe(
      true
    );
  });

  it("requires complete Polar credentials", () => {
    expect(
      makeConfig({ disabled: false, nodeEnv: "development", token: "" }).enabled
    ).toBe(false);
  });

  it("requires webhook ingestion", () => {
    const config = makeConfig({ disabled: false, nodeEnv: "production" });
    Object.assign(config as unknown as Record<string, unknown>, {
      _webhookSecret: "",
    });
    expect(config.enabled).toBe(false);
    expect(config.values).toBeUndefined();
  });

  it("requires every billing interval product", () => {
    const config = makeConfig({ disabled: false, nodeEnv: "production" });
    Object.assign(config as unknown as Record<string, unknown>, {
      _plusYearlyProductId: "",
    });
    expect(config.enabled).toBe(false);
  });
});
