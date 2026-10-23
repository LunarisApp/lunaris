/**
 * Best-effort PII scrubber for telemetry payloads. Pattern-matches and
 * replaces values that commonly leak into error messages and stack traces:
 * email addresses, OS-specific home paths, JWTs, and hex-shaped tokens.
 *
 * Used by the Sentry `beforeSend` hook on the backend and by
 * `captureExceptionSafe` on the frontend so that telemetry destinations
 * (Sentry, PostHog) never receive raw user content.
 */
const PII: ReadonlyArray<readonly [RegExp, string]> = [
  // RFC-5322-ish email
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]"],
  // Unix home paths (macOS / Linux)
  [/\/Users\/[^/\s"']+/g, "/Users/[redacted]"],
  [/\/home\/[^/\s"']+/g, "/home/[redacted]"],
  // Windows home paths
  [/C:\\Users\\[^\\]+/g, "C:\\Users\\[redacted]"],
  // JWTs (header.payload.signature, base64url)
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]"],
  // Bearer credentials that are not JWT-shaped
  [/\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi, "Bearer [token]"],
  // Secret-bearing URL query parameters
  [
    /([?&](?:access_token|api_key|code|device_code|user_code|oauth_query|sig|password|refresh_token|secret|token)=)[^&\s]+/gi,
    "$1[redacted]",
  ],
  // Long hex-shaped tokens (32+ chars, common API keys / secrets)
  [/\b[A-Fa-f0-9]{32,}\b/g, "[token]"],
];

export function scrubString(value: string): string {
  return PII.reduce((acc, [re, sub]) => acc.replace(re, sub), value);
}

export function scrubMaybe(value: string | undefined): string | undefined {
  return typeof value === "string" ? scrubString(value) : value;
}

const MAX_SCRUB_DEPTH = 6;
const MAX_SCRUB_ENTRIES = 100;
const SENSITIVE_OBJECT_KEY =
  /^(?:authorization|device_?code|user_?code|oauth_?query|sig|backupcodes?|content|cookies?|document(?:content|text)|email|name|password|passwd|prompt|secret|session(?:id|token)?|text|token|totpuri)$/i;

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    return scrubString(value);
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (depth >= MAX_SCRUB_DEPTH) {
    return "[truncated]";
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SCRUB_ENTRIES)
      .map((item) => scrubValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_SCRUB_ENTRIES)
        .map(([key, item]) => [
          key,
          SENSITIVE_OBJECT_KEY.test(key)
            ? "[redacted]"
            : scrubValue(item, depth + 1),
        ])
    );
  }
  return String(value);
}

/**
 * Recursively scrubs an arbitrary value before it leaves the application.
 */
export function scrubTelemetryValue(value: unknown): unknown {
  return scrubValue(value, 0);
}

const URL_PROPERTY_KEYS = new Set([
  "$current_url",
  "$external_click_url",
  "$initial_current_url",
  "$request_path",
  "$session_entry_url",
  "url",
]);
const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREFIXED_ID_PATH_SEGMENT = /^[a-z][a-z0-9-]*_[a-z0-9]{20}$/i;
const OPAQUE_ID_PATH_SEGMENT = /^(?=[a-z0-9_-]*\d)[a-z0-9_-]{24,}$/i;

/**
 * Removes query strings, fragments, and structured IDs from telemetry URL
 * properties. These commonly contain auth callbacks, search text, document
 * IDs, or invite data.
 */
export function scrubTelemetryProperties(
  properties: Record<string | number, unknown> | undefined
): Record<string | number, unknown> | undefined {
  if (!properties) {
    return undefined;
  }

  const scrubbed = scrubTelemetryValue(properties) as Record<
    string | number,
    unknown
  >;
  for (const [key, value] of Object.entries(scrubbed)) {
    if (!URL_PROPERTY_KEYS.has(key) || typeof value !== "string") {
      continue;
    }
    scrubbed[key] = stripUrlDetails(value);
  }
  return scrubbed;
}

function stripUrlDetails(value: string): string {
  try {
    const url = new URL(value, "https://telemetry.invalid");
    const sanitized = url.pathname
      .split("/")
      .map((segment) =>
        UUID_PATH_SEGMENT.test(segment) ||
        PREFIXED_ID_PATH_SEGMENT.test(segment) ||
        OPAQUE_ID_PATH_SEGMENT.test(segment)
          ? ":id"
          : segment
      )
      .join("/");
    return url.origin === "https://telemetry.invalid"
      ? sanitized
      : `${url.origin}${sanitized}`;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

/**
 * Clone an Error with its `message` and `stack` strings scrubbed of PII.
 * Recursively scrubs non-Error thrown values because JavaScript permits
 * throwing strings and arbitrary objects.
 */
export function scrubError(err: Error): Error;
export function scrubError(err: unknown): unknown;
export function scrubError(err: unknown): unknown {
  if (!(err instanceof Error)) {
    return scrubTelemetryValue(err);
  }
  const cloned = new Error(scrubString(err.message));
  cloned.name = err.name;
  if (err.stack) {
    cloned.stack = scrubString(err.stack);
  }
  return cloned;
}
