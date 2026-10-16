import type { ErrorReason } from "@repo/utils/errors";
import { type ErrorOptions, EvlogError } from "evlog";

type AppErrorOptions = Omit<ErrorOptions, "status"> & {
  status?: number;
  reason?: ErrorReason;
};

export class AppError extends EvlogError {
  readonly reason?: ErrorReason;

  constructor(opts: AppErrorOptions | string) {
    super(
      typeof opts === "string"
        ? { message: opts, status: 500 }
        : { status: 500, ...opts }
    );
    if (typeof opts === "object") {
      this.reason = opts.reason;
    }
    this.name = "AppError";
  }
}

export class BadRequestError extends AppError {
  constructor(opts: AppErrorOptions | string) {
    super(
      typeof opts === "string"
        ? { message: opts, status: 400 }
        : { status: 400, ...opts }
    );
    this.name = "BadRequestError";
  }
}

export class AuthorizationError extends AppError {
  constructor(opts: AppErrorOptions | string) {
    super(
      typeof opts === "string"
        ? { message: opts, status: 403 }
        : { status: 403, ...opts }
    );
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends AppError {
  constructor(opts: AppErrorOptions | string) {
    super(
      typeof opts === "string"
        ? { message: opts, status: 404 }
        : { status: 404, ...opts }
    );
    this.name = "NotFoundError";
  }
}

export class ServiceError extends AppError {
  constructor(opts: AppErrorOptions | string) {
    super(
      typeof opts === "string"
        ? { message: opts, status: 503 }
        : { status: 503, ...opts }
    );
    this.name = "ServiceError";
  }
}
