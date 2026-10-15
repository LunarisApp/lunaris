import posthog from "posthog-js";
import { scrubError } from "./scrub";

/**
 * Sends a scrubbed exception to PostHog without allowing telemetry failures to
 * affect the application.
 */
export function captureExceptionSafe(error: unknown): void {
  try {
    posthog.captureException(scrubError(error));
  } catch (telemetryError) {
    // biome-ignore lint/suspicious/noConsole: last-resort local diagnostic
    console.error("[telemetry]", scrubError(telemetryError));
  }
}
