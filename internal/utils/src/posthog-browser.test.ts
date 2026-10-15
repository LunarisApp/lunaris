import { describe, expect, mock, test } from "bun:test";
import type { PostHog } from "posthog-js";
import {
  initPostHogBrowser,
  resetPostHogIdentity,
  scrubPostHogCapture,
} from "./posthog-browser";

describe("initPostHogBrowser", () => {
  test("does not initialize an incomplete configuration", () => {
    const init = mock();
    const client = {
      init,
      register: mock(),
      reset: mock(),
    } as unknown as PostHog;

    expect(
      initPostHogBrowser(client, {
        apiHost: undefined,
        appSurface: "web",
        environment: "test",
        key: "ph_test",
        persistence: "localStorage",
        uiHost: "https://us.posthog.com",
      })
    ).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  test("uses privacy-safe defaults and restores context after reset", () => {
    const init = mock();
    const register = mock();
    const reset = mock();
    const client = { init, register, reset } as unknown as PostHog;

    expect(
      initPostHogBrowser(client, {
        apiHost: "https://metrics.example.com",
        appSurface: "desktop",
        appVersion: "1.2.3",
        environment: "production",
        key: "ph_test",
        cookielessMode: "on_reject",
        optOutCapturingByDefault: true,
        optOutPersistenceByDefault: true,
        persistence: "localStorage",
        uiHost: "https://us.posthog.com",
      })
    ).toBe(true);

    expect(init).toHaveBeenCalledWith(
      "ph_test",
      expect.objectContaining({
        autocapture: false,
        capture_pageview: false,
        cookieless_mode: "on_reject",
        disable_session_recording: true,
        opt_out_capturing_by_default: true,
        opt_out_persistence_by_default: true,
        person_profiles: "identified_only",
        respect_dnt: true,
      })
    );
    expect(register).toHaveBeenCalledWith({
      app_surface: "desktop",
      app_version: "1.2.3",
      environment: "production",
    });

    resetPostHogIdentity(client);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenLastCalledWith({
      app_surface: "desktop",
      app_version: "1.2.3",
      environment: "production",
    });
  });
});

describe("scrubPostHogCapture", () => {
  test("scrubs event and person properties", () => {
    expect(
      scrubPostHogCapture({
        event: "test",
        properties: {
          $current_url: "https://example.com/path?token=secret",
          email: "writer@example.com",
        },
        $set: { name: "Writer" },
        uuid: "event-id",
      })
    ).toEqual({
      event: "test",
      properties: {
        $current_url: "https://example.com/path",
        email: "[redacted]",
      },
      $set: { name: "[redacted]" },
      uuid: "event-id",
    });
  });
});
