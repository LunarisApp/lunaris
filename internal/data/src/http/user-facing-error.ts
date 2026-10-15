import { AppError, PluginError, StorageError, SyncError } from "@repo/utils";
import type { ErrorReason } from "@repo/utils/errors";
import { ApiError } from "./errors";

/**
 * Localized, user-facing description of an error.
 *
 * Call sites pass the resulting `titleKey` / `descriptionKey` to the i18n
 * translator (e.g. `t(ufe.titleKey)`) so the user sees a localized message
 * instead of raw `error.message`. The optional `requestId` lets users quote
 * a stable identifier when contacting support; `retry` is a UI hint for
 * whether a "Try again" affordance is appropriate.
 *
 * `description` is an already-resolved literal string — an escape hatch for
 * cases where no i18n key exists (e.g. unmapped Better Auth error codes,
 * where the server message is the most specific information available).
 * When present, call sites MUST prefer it over `t(descriptionKey)`. Use
 * `getUserFacingDescription(ufe, t)` to resolve correctly.
 */
export type UserFacingError = {
  titleKey: string;
  descriptionKey: string;
  description?: string;
  retry?: boolean;
  requestId?: string;
};

/**
 * Resolve the user-facing description, preferring the literal `description`
 * escape hatch over `t(descriptionKey)`. Always use this at call sites
 * instead of `t(ufe.descriptionKey)` to honor the escape hatch.
 */
export function getUserFacingDescription(
  ufe: UserFacingError,
  t: (key: string) => string
): string {
  return ufe.description ?? t(ufe.descriptionKey);
}

type ReasonMapping = {
  title: string;
  desc: string;
  retry?: boolean;
};

/**
 * Single source of truth mapping `ErrorReason` codes to i18n keys.
 *
 * The `satisfies Record<ErrorReason, ReasonMapping>` constraint forces a
 * compile error whenever a new reason is added to `@repo/utils/errors`
 * without a corresponding localization entry here.
 */
const REASON_TO_KEY = {
  "auth.session_expired": {
    title: "errors.reason.auth.sessionExpired.title",
    desc: "errors.reason.auth.sessionExpired.desc",
  },
  "auth.csrf_invalid": {
    title: "errors.reason.auth.csrf.title",
    desc: "errors.reason.auth.csrf.desc",
    retry: true,
  },
  "auth.unauthenticated": {
    title: "errors.reason.auth.unauthenticated.title",
    desc: "errors.reason.auth.unauthenticated.desc",
  },
  "entitlements.local_only_anonymous": {
    title: "errors.reason.entitlements.localOnlyAnon.title",
    desc: "errors.reason.entitlements.localOnlyAnon.desc",
  },
  "entitlements.organization_resource_limit_reached": {
    title: "errors.reason.entitlements.resourceLimit.title",
    desc: "errors.reason.entitlements.resourceLimit.desc",
  },
  "entitlements.organization_mismatch": {
    title: "errors.reason.entitlements.orgMismatch.title",
    desc: "errors.reason.entitlements.orgMismatch.desc",
  },
  "entitlements.no_active_organization": {
    title: "errors.reason.entitlements.noActiveOrg.title",
    desc: "errors.reason.entitlements.noActiveOrg.desc",
  },
  "entitlements.assistant_unavailable": {
    title: "errors.reason.entitlements.assistantUnavailable.title",
    desc: "errors.reason.entitlements.assistantUnavailable.desc",
  },
  "sync.unknown_table": {
    title: "errors.reason.sync.unknownTable.title",
    desc: "errors.reason.sync.unknownTable.desc",
  },
  "sync.invalid_parent": {
    title: "errors.reason.sync.invalidParent.title",
    desc: "errors.reason.sync.invalidParent.desc",
  },
  "sync.immutable_operation": {
    title: "errors.reason.sync.immutable.title",
    desc: "errors.reason.sync.immutable.desc",
  },
  "validation.failed": {
    title: "errors.validation.title",
    desc: "errors.validation.desc",
  },
  "ratelimit.exceeded": {
    title: "errors.ratelimit.title",
    desc: "errors.ratelimit.desc",
    retry: true,
  },
  "service.unavailable": {
    title: "errors.service.title",
    desc: "errors.service.desc",
    retry: true,
  },
  "server.internal": {
    title: "errors.server.title",
    desc: "errors.server.desc",
    retry: true,
  },
  "client.network_offline": {
    title: "errors.network.offline.title",
    desc: "errors.network.offline.desc",
    retry: true,
  },
  "client.storage_failure": {
    title: "errors.client.storage.title",
    desc: "errors.client.storage.desc",
  },
  "client.plugin_failure": {
    title: "errors.client.extension.title",
    desc: "errors.client.extension.desc",
  },
  "client.sync_failure": {
    title: "errors.client.sync.title",
    desc: "errors.client.sync.desc",
    retry: true,
  },
} as const satisfies Record<ErrorReason, ReasonMapping>;

const UNKNOWN: UserFacingError = {
  titleKey: "errors.unknown.title",
  descriptionKey: "errors.unknown.desc",
};

/**
 * Better Auth client errors are plain objects `{ code, message, status }`
 * (from `better-fetch`) — not `ApiError`. Map known codes to i18n keys; fall
 * back to HTTP status bucket. Seed with cases we've surfaced; extend as needed.
 */
const BETTER_AUTH_CODE_TO_KEY: Record<string, ReasonMapping> = {
  ORGANIZATION_SLUG_ALREADY_TAKEN: {
    title: "errors.reason.auth.orgSlugTaken.title",
    desc: "errors.reason.auth.orgSlugTaken.desc",
  },
  ORGANIZATION_MEMBER_LIMIT_REACHED: {
    title: "errors.reason.auth.organizationMemberLimit.title",
    desc: "errors.reason.auth.organizationMemberLimit.desc",
  },
  ORGANIZATION_BILLING_OWNER_REQUIRED: {
    title: "errors.reason.auth.organizationBillingOwner.title",
    desc: "errors.reason.auth.organizationBillingOwner.desc",
  },
};

type BetterAuthError = { code: string; message?: string; status?: number };

function isBetterAuthError(err: unknown): err is BetterAuthError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  );
}

function fromMapping(
  reason: ErrorReason,
  requestId?: string
): UserFacingError {
  const m: ReasonMapping = REASON_TO_KEY[reason];
  return {
    titleKey: m.title,
    descriptionKey: m.desc,
    retry: m.retry,
    requestId,
  };
}

function fromStatus(
  status: number,
  requestId?: string
): UserFacingError {
  // Bucket fallback when the backend did not (or could not) supply a typed
  // reason — e.g. an upstream proxy 502 or an older API version.
  if (status === 401) return fromMapping("auth.unauthenticated", requestId);
  if (status === 403) return fromMapping("auth.unauthenticated", requestId);
  if (status === 404)
    return {
      titleKey: "errors.http.notFound.title",
      descriptionKey: "errors.http.notFound.desc",
      requestId,
    };
  if (status === 409)
    return {
      titleKey: "errors.http.conflict.title",
      descriptionKey: "errors.http.conflict.desc",
      requestId,
    };
  if (status === 429) return fromMapping("ratelimit.exceeded", requestId);
  if (status >= 500) return fromMapping("server.internal", requestId);
  if (status >= 400)
    return {
      titleKey: "errors.http.badRequest.title",
      descriptionKey: "errors.http.badRequest.desc",
      requestId,
    };
  return { ...UNKNOWN, requestId };
}

/**
 * Map any thrown value into a localized `UserFacingError`.
 *
 * Resolution order:
 * 1. `ApiError.isOffline` → network-offline keys.
 * 2. `ApiError.reason` (typed `ErrorReason`) → `REASON_TO_KEY` lookup.
 * 3. `ApiError.statusCode` → HTTP status bucket fallback.
 * 4. Frontend `SyncError` / `StorageError` / `PluginError` → matching
 *    client.* keys (these subclasses already carry a default `reason`).
 * 5. Any other `AppError` with a typed reason → `REASON_TO_KEY` lookup.
 * 6. Anything else → generic unknown.
 */
export function getUserFacingError(err: unknown): UserFacingError {
  if (err instanceof ApiError) {
    if (err.isOffline) {
      return fromMapping("client.network_offline", err.requestId);
    }
    if (err.reason && err.reason in REASON_TO_KEY) {
      return fromMapping(err.reason, err.requestId);
    }
    return fromStatus(err.statusCode, err.requestId);
  }
  if (err instanceof SyncError) return fromMapping("client.sync_failure");
  if (err instanceof StorageError) {
    return fromMapping("client.storage_failure");
  }
  if (err instanceof PluginError) return fromMapping("client.plugin_failure");
  if (err instanceof AppError && err.reason && err.reason in REASON_TO_KEY) {
    return fromMapping(err.reason);
  }
  if (isBetterAuthError(err)) {
    const mapped = BETTER_AUTH_CODE_TO_KEY[err.code];
    if (mapped) {
      return {
        titleKey: mapped.title,
        descriptionKey: mapped.desc,
        retry: mapped.retry,
      };
    }
    // Unmapped code: surface the server message as description so the user
    // sees specific detail instead of "Something went wrong". Title stays a
    // generic translated label; description is the untranslated server string.
    if (err.message) {
      return {
        titleKey: "errors.auth.title",
        descriptionKey: "errors.unknown.desc",
        description: err.message,
      };
    }
    if (typeof err.status === "number") return fromStatus(err.status);
  }
  return UNKNOWN;
}
