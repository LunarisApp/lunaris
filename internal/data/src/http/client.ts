import { ApiError } from "./errors";
import type { ApiRequestOptions, HttpMethod } from "./types";

const DEFAULT_TIMEOUT = 30_000;

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(baseUrl: string) {
  const apiOrigin = new URL(baseUrl).origin;

  async function authenticatedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const sourceRequest = input instanceof Request ? input : undefined;
    const url = new URL(sourceRequest?.url ?? String(input), baseUrl);
    if (url.origin !== apiOrigin) {
      throw new TypeError(
        "Authenticated API requests must stay on the API origin"
      );
    }

    const method = init?.method ?? sourceRequest?.method ?? "GET";
    const headers = new Headers(sourceRequest?.headers);
    new Headers(init?.headers).forEach((value, key) => {
      headers.set(key, value);
    });

    return fetch(url, {
      ...(sourceRequest
        ? {
            body: sourceRequest.body,
            cache: sourceRequest.cache,
            integrity: sourceRequest.integrity,
            keepalive: sourceRequest.keepalive,
            mode: sourceRequest.mode,
            redirect: sourceRequest.redirect,
            referrer: sourceRequest.referrer,
            referrerPolicy: sourceRequest.referrerPolicy,
            signal: sourceRequest.signal,
          }
        : {}),
      ...init,
      credentials: "include",
      headers,
      method,
    });
  }

  async function request<T>(
    method: HttpMethod,
    path: string,
    opts?: ApiRequestOptions,
  ): Promise<T> {
    const { body, params, timeout = DEFAULT_TIMEOUT, ...init } = opts ?? {};

    // Build URL
    const url = new URL(path, baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    // Timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const headers = new Headers(init.headers);
      if (body !== undefined) {
        headers.set("Content-Type", "application/json");
      }

      const res = await authenticatedFetch(url, {
        method,
        signal: controller.signal,
        ...init,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        throw await ApiError.fromResponse(res);
      }

      if (res.status === 204) {
        return undefined as T;
      }

      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err instanceof TypeError) throw ApiError.offline(err);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    baseUrl,
    fetch: authenticatedFetch,
    get: <T>(path: string, opts?: ApiRequestOptions) =>
      request<T>("GET", path, opts),
    post: <T>(path: string, opts?: ApiRequestOptions) =>
      request<T>("POST", path, opts),
    put: <T>(path: string, opts?: ApiRequestOptions) =>
      request<T>("PUT", path, opts),
    patch: <T>(path: string, opts?: ApiRequestOptions) =>
      request<T>("PATCH", path, opts),
    delete: <T>(path: string, opts?: ApiRequestOptions) =>
      request<T>("DELETE", path, opts),
  };
}
