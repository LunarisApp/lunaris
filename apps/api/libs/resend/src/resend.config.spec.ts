import { describe, expect, it } from "bun:test";
import { ConfigService } from "@nestjs/config";
import { ResendConfig } from "./resend.config";

describe("mail configuration", () => {
  it.each([undefined, "", "   "])(
    "disables delivery with blank key %j",
    (key) => {
      expect(
        new ResendConfig(new ConfigService({ RESEND_API_KEY: key })).values
      ).toBeUndefined();
    }
  );
  it("normalizes the configured key", () => {
    expect(
      new ResendConfig(new ConfigService({ RESEND_API_KEY: " test-key " }))
        .values
    ).toEqual({ apiKey: "test-key" });
  });
});

it("requires an owned sender when self-hosted delivery is enabled", () => {
  expect(
    () =>
      new ResendConfig(
        new ConfigService({
          DEPLOYMENT_MODE: "self-hosted",
          RESEND_API_KEY: "test-key",
          EMAIL_FROM: " ",
        })
      )
  ).toThrow("EMAIL_FROM is required");
  const config = new ResendConfig(
    new ConfigService({
      DEPLOYMENT_MODE: "self-hosted",
      RESEND_API_KEY: "test-key",
      EMAIL_FROM: " Notes <notes@example.com> ",
      EMAIL_REPLY_TO: " admin@example.com ",
    })
  );
  expect(config.from).toBe("Notes <notes@example.com>");
  expect(config.replyTo).toBe("admin@example.com");
});

it.each([
  [{}, false],
  [{ RESEND_API_KEY: "test-key" }, true],
  [{ E2E_AUTH_EMAIL_LOGS: "true" }, true],
  [{ E2E_AUTH_EMAIL_LOGS: "false" }, false],
] as const)("reports auth email capability for %j", (values, enabled) => {
  expect(
    new ResendConfig(new ConfigService(values)).authEmailDeliveryEnabled
  ).toBe(enabled);
});
