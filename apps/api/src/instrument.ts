import { scrubMaybe, scrubString } from "@app/utils/scrub";
import * as Sentry from "@sentry/nestjs";
import type { DrainContext, DrainFn } from "evlog";
import { auditRedactPreset, initLogger } from "evlog";
import { createDrainPipeline } from "evlog/pipeline";
import { createPostHogDrain } from "evlog/posthog";

export const logDrain = process.env.POSTHOG_API_KEY
  ? createDrainPipeline<DrainContext>({
      onDropped: (events, error) => {
        process.stderr.write(
          `${JSON.stringify({
            context: "EvlogDrain",
            droppedEvents: events.length,
            error: scrubMaybe(error?.message),
            level: "error",
            message: "PostHog log delivery exhausted retries",
            service: "api",
          })}\n`,
        );
      },
    })(createPostHogDrain())
  : undefined;

let auditDrain: DrainFn | undefined;
const pendingAuditDeliveries = new Set<Promise<unknown>>();

export function registerAuditDrain(drain: DrainFn) {
  auditDrain = drain;
}

export function unregisterAuditDrain() {
  auditDrain = undefined;
}

export async function appDrain(ctx: DrainContext) {
  const currentAuditDrain = auditDrain;
  const mainDelivery =
    logDrain && ctx.event.level !== "debug"
      ? Promise.resolve().then(() => logDrain(ctx))
      : undefined;
  const auditDelivery = currentAuditDrain
    ? Promise.resolve().then(() => currentAuditDrain(ctx))
    : undefined;
  if (auditDelivery) {
    pendingAuditDeliveries.add(auditDelivery);
    const settled = () => {
      pendingAuditDeliveries.delete(auditDelivery);
    };
    void auditDelivery.then(settled, settled);
  }
  const deliveries = [
    ...(mainDelivery ? [mainDelivery] : []),
    ...(auditDelivery ? [auditDelivery] : []),
  ];
  if (deliveries.length === 0) return;

  const results = await Promise.allSettled(deliveries);
  const auditResult = auditDelivery ? results.at(-1) : undefined;
  if (auditResult?.status === "rejected") {
    process.stderr.write(
      `${JSON.stringify({
        context: "AuditDrain",
        error: scrubMaybe(
          auditResult.reason instanceof Error
            ? auditResult.reason.message
            : String(auditResult.reason),
        ),
        level: "error",
        message: "Compliance audit delivery failed",
        service: "api",
      })}\n`,
    );
    throw auditResult.reason;
  }
}

// In e2e mode, force JSON-per-line output regardless of NODE_ENV so the
// cypress `getAuthEmailUrl` task can parse backend.log reliably. evlog
// defaults to pretty ANSI output when NODE_ENV !== "production", which
// the regex parser can't scan.
const e2eJsonLogs = process.env.E2E_JSON_LOGS === "true";
const commitHash = process.env.RAILWAY_GIT_COMMIT_SHA;
const serviceVersion = commitHash?.slice(0, 7) ?? "local";

initLogger({
  env: {
    service: "api",
    version: serviceVersion,
    ...(commitHash ? { commitHash } : {}),
  },
  ...(e2eJsonLogs ? { pretty: false, stringify: true } : {}),
  drain: appDrain,
  redact: auditRedactPreset,
});

export async function flushLogDrain() {
  while (pendingAuditDeliveries.size) {
    await Promise.allSettled([...pendingAuditDeliveries]);
  }
  await logDrain?.flush();
}

const sentryDsn = process.env.SENTRY_DSN?.trim();

Sentry.init({
  enabled: process.env.NODE_ENV === "production" && Boolean(sentryDsn),
  dsn: sentryDsn,
  integrations: [],
  tracesSampleRate: 1.0,
  profileSessionSampleRate: 1.0,
  /**
   * Strip PII from outbound events before they hit Sentry. We scrub the
   * exception messages and stack frame filenames, then drop request bodies
   * entirely — request payloads can contain document content from the
   * editor and are not worth the leak risk for debugging.
   */
  beforeSend(event) {
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        ex.value = scrubMaybe(ex.value);
        if (ex.stacktrace?.frames) {
          for (const frame of ex.stacktrace.frames) {
            frame.filename = scrubMaybe(frame.filename);
          }
        }
      }
    }
    if (event.message) {
      event.message =
        typeof event.message === "string"
          ? scrubString(event.message)
          : event.message;
    }
    if (event.request) {
      // Drop bodies and cookies; keep method/url/headers (auth headers are
      // already filtered server-side by Sentry's default ingest pipeline).
      delete event.request.data;
      delete event.request.cookies;
    }
    return event;
  },
});
