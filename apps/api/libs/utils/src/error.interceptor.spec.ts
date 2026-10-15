import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  AuthorizationError,
  BadRequestError,
  ServiceError,
} from "@app/utils/errors";
import { CallHandler, ExecutionContext, HttpException } from "@nestjs/common";
import * as Sentry from "@sentry/nestjs";
import { SchemaValidationException } from "./schema-validation";
import { of, throwError } from "rxjs";
import { mockEvlogLogger } from "../../../test/preload";
import { ErrorInterceptor } from "./error.interceptor";

const mockLogger = mockEvlogLogger;

describe("ErrorInterceptor", () => {
  let interceptor: ErrorInterceptor;
  const mockContext = {} as ExecutionContext;

  beforeEach(() => {
    interceptor = new ErrorInterceptor();
    mockLogger.error.mockClear();
    mockLogger.set.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.getContext.mockReset();
    mockLogger.getContext.mockImplementation(() => ({
      path: undefined,
      requestId: "test-request-id",
    }));
  });

  it("re-throws HttpException with requestId and timestamp", async () => {
    const original = new HttpException({ message: "Not Found" }, 404);
    const handler: CallHandler = {
      handle: () => throwError(() => original),
    };

    try {
      await interceptor.intercept(mockContext, handler).toPromise();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const response = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.requestId).toBe("test-request-id");
      expect(response.timestamp).toBeDefined();
      expect((err as HttpException).getStatus()).toBe(404);
    }

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("converts ServiceError to 503 with structured fields", async () => {
    const handler: CallHandler = {
      handle: () =>
        throwError(
          () =>
            new ServiceError({
              link: "https://docs.example.com/services",
              message: "downstream failed",
              why: "API timeout",
              reason: "service.unavailable",
            }),
        ),
    };

    try {
      await interceptor.intercept(mockContext, handler).toPromise();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const response = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.statusCode).toBe(503);
      expect(response.message).toBe("downstream failed");
      expect(response.why).toBe("API timeout");
      expect(response.link).toBe("https://docs.example.com/services");
      expect(response.reason).toBe("service.unavailable");
      expect(response.requestId).toBe("test-request-id");
    }

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("AppError responses never include a stack trace", async () => {
    const handler: CallHandler = {
      handle: () =>
        throwError(
          () =>
            new BadRequestError({
              message: "bad",
              reason: "validation.failed",
            }),
        ),
    };

    try {
      await interceptor.intercept(mockContext, handler).toPromise();
      expect.unreachable("should have thrown");
    } catch (err) {
      const response = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.stack).toBeUndefined();
      expect(JSON.stringify(response)).not.toContain("at ");
    }
  });

  it("converts AuthorizationError to 403", async () => {
    const handler: CallHandler = {
      handle: () =>
        throwError(() => new AuthorizationError({ message: "Access denied" })),
    };

    try {
      await interceptor.intercept(mockContext, handler).toPromise();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(403);
    }

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("converts BadRequestError to 400", async () => {
    const handler: CallHandler = {
      handle: () =>
        throwError(() => new BadRequestError({ message: "Invalid input" })),
    };

    try {
      await interceptor.intercept(mockContext, handler).toPromise();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
    }

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("converts unknown errors to 500", async () => {
    const captureException = spyOn(
      Sentry,
      "captureException",
    ).mockImplementation(() => "");
    const handler: CallHandler = {
      handle: () => throwError(() => new Error("unexpected")),
    };

    try {
      await interceptor.intercept(mockContext, handler).toPromise();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const response = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.statusCode).toBe(500);
      expect(response.reason).toBe("server.internal");
      expect(response.requestId).toBe("test-request-id");
    }

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
    captureException.mockRestore();
  });

  it("handles missing request context gracefully", async () => {
    mockLogger.getContext.mockImplementation(() => {
      throw new Error("No context");
    });

    const handler: CallHandler = {
      handle: () => throwError(() => new Error("oops")),
    };

    const captureException = spyOn(
      Sentry,
      "captureException",
    ).mockImplementation(() => "");

    try {
      await interceptor.intercept(mockContext, handler).toPromise();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const response = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.statusCode).toBe(500);
      expect(response.requestId).toBeUndefined();
    }

    captureException.mockRestore();
  });

  it("passes through successful responses", async () => {
    const handler: CallHandler = {
      handle: () => of({ data: "ok" }),
    };

    const result = await interceptor
      .intercept(mockContext, handler)
      .toPromise();
    expect(result).toEqual({ data: "ok" });
  });

  it("logs field-level details for SchemaValidationException but keeps them off the wire", async () => {
    const zodError = {
      issues: [
        { path: ["body", "email"], message: "Invalid email" },
        { path: ["body", "age"], message: "Number must be greater than 0" },
      ],
    };
    const handler: CallHandler = {
      handle: () =>
        throwError(() => new SchemaValidationException(zodError.issues)),
    };

    try {
      await interceptor.intercept(mockContext, handler).toPromise();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
      const response = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      // Generic envelope only; no `errors` array, no field paths leaking.
      expect(response.statusCode).toBe(400);
      expect(response.message).toBe("Validation failed");
      expect(response.reason).toBe("validation.failed");
      expect(response.errors).toBeUndefined();
      expect(JSON.stringify(response)).not.toContain("body.email");
      expect(JSON.stringify(response)).not.toContain("body.age");
    }

    expect(mockLogger.set).toHaveBeenCalledWith({
      validation: {
        issues: [
          { path: "body.email", message: "Invalid email" },
          { path: "body.age", message: "Number must be greater than 0" },
        ],
      },
    });
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("logs an empty issue list without leaking diagnostics", async () => {
    const handler: CallHandler = {
      handle: () => throwError(() => new SchemaValidationException([])),
    };

    try {
      await interceptor.intercept(mockContext, handler).toPromise();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
    }

    expect(mockLogger.set).toHaveBeenCalledWith({ validation: { issues: [] } });
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});
