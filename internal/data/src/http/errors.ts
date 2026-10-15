import { type ErrorReason, isErrorReason } from "@repo/utils/errors";
import type { ApiErrorResponse } from "./types";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly reason?: ErrorReason;
  readonly why?: string;
  readonly fix?: string;
  readonly requestId?: string;
  readonly timestamp?: string;
  readonly validationErrors?: ApiErrorResponse["errors"];
  readonly isOffline: boolean;

  private constructor(
    message: string,
    fields: {
      statusCode: number;
      reason?: ErrorReason;
      why?: string;
      fix?: string;
      requestId?: string;
      timestamp?: string;
      validationErrors?: ApiErrorResponse["errors"];
      isOffline?: boolean;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = fields.statusCode;
    this.reason = fields.reason;
    this.why = fields.why;
    this.fix = fields.fix;
    this.requestId = fields.requestId;
    this.timestamp = fields.timestamp;
    this.validationErrors = fields.validationErrors;
    this.isOffline = fields.isOffline ?? false;
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    let body: ApiErrorResponse | undefined;
    try {
      body = (await res.json()) as ApiErrorResponse;
    } catch {
      // Response body is not JSON or empty
    }

    return new ApiError(body?.message ?? res.statusText, {
      statusCode: body?.statusCode ?? res.status,
      reason: isErrorReason(body?.reason) ? body.reason : undefined,
      why: body?.why,
      fix: body?.fix,
      requestId: body?.requestId,
      timestamp: body?.timestamp,
      validationErrors: body?.errors,
    });
  }

  static offline(_cause: Error): ApiError {
    return new ApiError("Network request failed", {
      statusCode: 0,
      reason: "client.network_offline",
      isOffline: true,
    });
  }
}
