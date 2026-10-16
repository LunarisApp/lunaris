import { afterEach, describe, expect, it } from "bun:test";
import { sanitizePostHogEvent } from "./posthog.module";

const originalNodeEnv = process.env.NODE_ENV;
const originalCommitHash = process.env.RAILWAY_GIT_COMMIT_SHA;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.RAILWAY_GIT_COMMIT_SHA = originalCommitHash;
});

describe("sanitizePostHogEvent", () => {
  it("adds source context and scrubs outbound properties", () => {
    process.env.NODE_ENV = "production";
    process.env.RAILWAY_GIT_COMMIT_SHA = "abcdef123456";

    expect(
      sanitizePostHogEvent(
        {
          distinctId: "user_123",
          event: "$exception",
          properties: {
            $current_url: "https://api.example.com/callback?code=secret",
            $ip: "192.0.2.1",
            error: { email: "writer@example.com" },
          },
        },
        "application"
      )
    ).toEqual({
      distinctId: "user_123",
      event: "$exception",
      properties: {
        $current_url: "https://api.example.com/callback",
        app_surface: "api",
        app_version: "abcdef1",
        environment: "production",
        error: { email: "[redacted]" },
        telemetry_source: "application",
      },
    });
  });
});
