import { describe, expect, mock, test } from "bun:test";
import type { WideEvent } from "evlog";
import { createPostHogBrowserDrain } from "./posthog-log";

describe("createPostHogBrowserDrain", () => {
  test("maps an Evlog event to a structured PostHog log", () => {
    const captureLog = mock();
    const drain = createPostHogBrowserDrain({ captureLog });
    const event: WideEvent = {
      timestamp: "2026-07-27T12:00:00.000Z",
      level: "warn",
      service: "web",
      environment: "production",
      version: "abc1234",
      action: "document.sync",
      outcome: "retry",
      document: { content: "private writing", id: "doc_1" },
      error: { message: "failed for ada@example.com" },
    };

    drain({ event });

    expect(captureLog).toHaveBeenCalledWith({
      body: "document.sync",
      level: "warn",
      attributes: {
        action: "document.sync",
        outcome: "retry",
        document: {
          content: "[redacted]",
          id: "doc_1",
        },
        error: {
          message: "failed for [email]",
        },
      },
    });
  });

  test("forwards valid trace context", () => {
    const captureLog = mock();
    const drain = createPostHogBrowserDrain({ captureLog });

    drain({
      event: {
        timestamp: "2026-07-27T12:00:00.000Z",
        level: "error",
        service: "desktop",
        environment: "production",
        message: "Request failed",
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
      },
    });

    expect(captureLog).toHaveBeenCalledWith(
      expect.objectContaining({
        trace_id: "a".repeat(32),
        span_id: "b".repeat(16),
      })
    );
  });
});
