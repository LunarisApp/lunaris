import { type ErrorOptions, EvlogError } from "evlog";

/**
 * Shared registry of machine-readable error reason codes.
 *
 * Backend and frontend errors use this registry so reasons stay synchronized.
 * Add new reasons here before updating the frontend localization map.
 */
export const ERROR_REASONS = [
  // auth
  "auth.session_expired",
  "auth.csrf_invalid",
  "auth.unauthenticated",
  // entitlements
  "entitlements.local_only_anonymous",
  "entitlements.organization_resource_limit_reached",
  "entitlements.organization_mismatch",
  "entitlements.no_active_organization",
  "entitlements.assistant_unavailable",
  // sync
  "sync.unknown_table",
  "sync.invalid_parent",
  "sync.immutable_operation",
  // generic server
  "validation.failed",
  "ratelimit.exceeded",
  "service.unavailable",
  "server.internal",
  // client-side
  "client.network_offline",
  "client.storage_failure",
  "client.plugin_failure",
  "client.sync_failure",
] as const;

export type ErrorReason = (typeof ERROR_REASONS)[number];

export const isErrorReason = (value: unknown): value is ErrorReason =>
  typeof value === "string" &&
  (ERROR_REASONS as readonly string[]).includes(value);

type ClientErrorOptions = Omit<ErrorOptions, "status"> & {
  reason?: ErrorReason;
};

export class AppError extends EvlogError {
  readonly reason?: ErrorReason;

  constructor(opts: ClientErrorOptions | string) {
    super(typeof opts === "string" ? { message: opts } : opts);
    if (typeof opts === "object") {
      this.reason = opts.reason;
    }
    this.name = "AppError";
  }
}

export class SyncError extends AppError {
  constructor(opts: ClientErrorOptions | string) {
    super(
      typeof opts === "string"
        ? { message: opts, reason: "client.sync_failure" }
        : { reason: "client.sync_failure", ...opts }
    );
    this.name = "SyncError";
  }
}

export class StorageError extends AppError {
  constructor(opts: ClientErrorOptions | string) {
    super(
      typeof opts === "string"
        ? { message: opts, reason: "client.storage_failure" }
        : { reason: "client.storage_failure", ...opts }
    );
    this.name = "StorageError";
  }
}

export class PluginError extends AppError {
  constructor(opts: ClientErrorOptions | string) {
    super(
      typeof opts === "string"
        ? { message: opts, reason: "client.plugin_failure" }
        : { reason: "client.plugin_failure", ...opts }
    );
    this.name = "PluginError";
  }
}
