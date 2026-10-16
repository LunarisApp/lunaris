import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { ApiError } from "./errors";

const BASE_URL = "http://localhost:3000";

describe("createApiClient", () => {
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
  let api: ReturnType<typeof createApiClient>;

  beforeEach(() => {
    fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);
    api = createApiClient(BASE_URL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function lastCall(index = fetchSpy.mock.calls.length - 1) {
    const call = fetchSpy.mock.calls[index];
    expect(call).toBeDefined();
    return call!;
  }

  describe("successful requests", () => {
    it("GET request with JSON response", async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1, name: "test" }));

      const result = await api.get<{ id: number; name: string }>("/v1/items");

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = lastCall();
      expect(url.toString()).toBe(`${BASE_URL}/v1/items`);
      expect(init?.method).toBe("GET");
      expect(init?.credentials).toBe("include");
      expect(result).toEqual({ id: 1, name: "test" });
    });

    it("POST request with JSON body", async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1 }, 201));

      await api.post("/v1/items", { body: { name: "new" } });

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [, init] = lastCall(0);
      const headers = new Headers(init?.headers);
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ name: "new" }));
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.get("x-csrf-token")).toBeNull();
    });

    it("204 No Content returns undefined", async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const result = await api.delete("/v1/items/1");

      expect(result).toBeUndefined();
    });

    it("appends query params, filters undefined", async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse([]));

      await api.get("/v1/items", {
        params: { page: 1, search: "test", empty: undefined },
      });

      const [url] = lastCall();
      const parsed = new URL(url.toString());
      expect(parsed.searchParams.get("page")).toBe("1");
      expect(parsed.searchParams.get("search")).toBe("test");
      expect(parsed.searchParams.has("empty")).toBe(false);
    });

    it("forwards custom headers", async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));

      await api.get("/v1/items", {
        headers: { "X-Custom": "value" },
      });

      const [, init] = lastCall();
      expect(new Headers(init?.headers).get("x-custom")).toBe("value");
    });
  });

  describe("authenticated fetch", () => {
    it("adds session credentials to streamed requests without a token round trip", async () => {
      fetchSpy.mockResolvedValueOnce(new Response("stream"));

      await api.fetch("/v1/ai/chat", {
        body: JSON.stringify({ messages: [] }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const [url, init] = lastCall(0);
      expect(url.toString()).toBe(`${BASE_URL}/v1/ai/chat`);
      expect(init?.credentials).toBe("include");
      expect(new Headers(init?.headers).get("x-csrf-token")).toBeNull();
    });

    it("rejects requests to another origin before exposing credentials", async () => {
      await expect(api.fetch("https://example.com/chat")).rejects.toThrow(
        "must stay on the API origin"
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("throws ApiError on 4xx", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 400,
            message: "Bad Request",
            why: "Invalid field",
            fix: "Check docs",
          }),
          { status: 400 }
        )
      );

      const promise = api.get("/v1/items");
      await expect(promise).rejects.toThrow(ApiError);

      const err = (await promise.catch((e) => e)) as ApiError;
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe("Bad Request");
      expect(err.why).toBe("Invalid field");
      expect(err.fix).toBe("Check docs");
    });

    it("throws ApiError on 5xx", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ statusCode: 500, message: "Internal Server Error" }),
          { status: 500 }
        )
      );

      const promise = api.get("/v1/items");
      await expect(promise).rejects.toThrow(ApiError);

      const err = (await promise.catch((e) => e)) as ApiError;
      expect(err.statusCode).toBe(500);
    });

    it("throws offline ApiError on TypeError", async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const promise = api.get("/v1/items");
      await expect(promise).rejects.toThrow(ApiError);

      const err = (await promise.catch((e) => e)) as ApiError;
      expect(err.isOffline).toBe(true);
      expect(err.statusCode).toBe(0);
    });

    it("rethrows non-TypeError/non-ApiError", async () => {
      const original = new Error("Something unexpected");
      fetchSpy.mockRejectedValueOnce(original);

      const err = (await api.get("/v1/items").catch((e) => e)) as Error;

      expect(err).toBe(original);
      expect(err).not.toBeInstanceOf(ApiError);
    });
  });

  describe("method shortcuts", () => {
    it.each(["get", "post", "put", "patch", "delete"] as const)(
      "%s sends correct HTTP method",
      async (method) => {
        if (method === "get") {
          fetchSpy.mockResolvedValueOnce(jsonResponse({}));
        } else {
          fetchSpy.mockResolvedValueOnce(jsonResponse({}));
        }

        await api[method]("/v1/test");

        const [, init] = lastCall();
        expect(init?.method).toBe(method.toUpperCase());
      }
    );

    it("sends mutations without fetching CSRF tokens", async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({ ok: true }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      await api.post("/v1/items", { body: { name: "one" } });
      await api.patch("/v1/items/1", { body: { name: "two" } });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls.map(([url]) => url.toString())).toEqual([
        `${BASE_URL}/v1/items`,
        `${BASE_URL}/v1/items/1`,
      ]);
      for (const [, init] of fetchSpy.mock.calls) {
        expect(new Headers(init?.headers).has("x-csrf-token")).toBe(false);
      }
    });
  });

  describe("timeout", () => {
    it("aborts request after timeout", async () => {
      fetchSpy.mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          })
      );

      const err = (await api
        .get("/v1/slow", { timeout: 10 })
        .catch((e) => e)) as DOMException;

      expect(err).toBeInstanceOf(DOMException);
      expect(err.name).toBe("AbortError");
    });
  });
});
