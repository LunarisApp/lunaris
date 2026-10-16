import type { DrainFn, WideEvent } from "evlog";
import type { PostHog } from "posthog-js";
import { scrubString, scrubTelemetryValue } from "./scrub";

const MAX_BODY_LENGTH = 2048;
const RESOURCE_FIELDS = new Set([
  "commitHash",
  "environment",
  "level",
  "service",
  "spanId",
  "timestamp",
  "traceFlags",
  "traceId",
  "version",
]);
const TRACE_ID = /^[a-f0-9]{32}$/i;
const SPAN_ID = /^[a-f0-9]{16}$/i;

type PostHogLogClient = Pick<PostHog, "captureLog">;
type PostHogLogAttributes = NonNullable<
  Parameters<PostHog["captureLog"]>[0]["attributes"]
>;

function logBody(event: WideEvent): string {
  const candidate = [event.action, event.message, event.tag].find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  return scrubString(candidate ?? "Application log").slice(0, MAX_BODY_LENGTH);
}

function logAttributes(event: WideEvent): PostHogLogAttributes {
  return scrubTelemetryValue(
    Object.fromEntries(
      Object.entries(event).filter(([key]) => !RESOURCE_FIELDS.has(key))
    )
  ) as PostHogLogAttributes;
}

/**
 * Creates a browser Evlog drain that enqueues structured logs directly in the
 * PostHog JavaScript SDK. PostHog supplies the active distinct ID and groups.
 */
export function createPostHogBrowserDrain(client: PostHogLogClient): DrainFn {
  return ({ event }) => {
    try {
      client.captureLog({
        body: logBody(event),
        level: event.level,
        attributes: logAttributes(event),
        ...(typeof event.traceId === "string" && TRACE_ID.test(event.traceId)
          ? { trace_id: event.traceId }
          : {}),
        ...(typeof event.spanId === "string" && SPAN_ID.test(event.spanId)
          ? { span_id: event.spanId }
          : {}),
      });
    } catch {
      console.error("[telemetry] PostHog log enqueue failed");
    }
  };
}
