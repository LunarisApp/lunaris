import type { ErrorReason } from "@repo/utils/errors";

/** Matches backend ErrorInterceptor output shape */
export interface ApiErrorResponse {
  /** Optional structured validation details */
  errors?: Array<{
    code: string;
    message: string;
    path: string[];
  }>;
  fix?: string;
  message: string;
  /** Machine-readable error code for frontend display mapping */
  reason?: ErrorReason;
  requestId?: string;
  statusCode: number;
  timestamp?: string;
  why?: string;
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  /** Auto-serialized to JSON */
  body?: unknown;
  /** URL query params (undefined values are filtered out) */
  params?: Record<string, string | number | boolean | undefined>;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
