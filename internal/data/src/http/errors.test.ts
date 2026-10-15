import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";

describe("ApiError", () => {
  describe("fromResponse", () => {
    it("parses full backend error envelope", async () => {
      const body = {
        statusCode: 400,
        message: "Invalid input",
        why: "Missing required field",
        fix: "Add the 'name' field",
        timestamp: "2026-03-29T00:00:00Z",
        requestId: "req-123",
      };
      const res = new Response(JSON.stringify(body), { status: 400 });

      const err = await ApiError.fromResponse(res);

      expect(err).toBeInstanceOf(ApiError);
      expect(err.message).toBe("Invalid input");
      expect(err.statusCode).toBe(400);
      expect(err.why).toBe("Missing required field");
      expect(err.fix).toBe("Add the 'name' field");
      expect(err.requestId).toBe("req-123");
      expect(err.timestamp).toBe("2026-03-29T00:00:00Z");
      expect(err.isOffline).toBe(false);
      expect(err.name).toBe("ApiError");
    });

    it("parses validation errors", async () => {
      const body = {
        statusCode: 400,
        message: "Validation failed",
        errors: [
          { code: "too_small", message: "Required", path: ["name"] },
        ],
      };
      const res = new Response(JSON.stringify(body), { status: 400 });

      const err = await ApiError.fromResponse(res);

      expect(err.validationErrors).toEqual([
        { code: "too_small", message: "Required", path: ["name"] },
      ]);
    });

    it("falls back to statusText when body is not JSON", async () => {
      const res = new Response("Not Found", {
        status: 404,
        statusText: "Not Found",
      });

      const err = await ApiError.fromResponse(res);

      expect(err.message).toBe("Not Found");
      expect(err.statusCode).toBe(404);
      expect(err.why).toBeUndefined();
    });

    it("falls back to statusText when body is empty", async () => {
      const res = new Response(null, {
        status: 500,
        statusText: "Internal Server Error",
      });

      const err = await ApiError.fromResponse(res);

      expect(err.message).toBe("Internal Server Error");
      expect(err.statusCode).toBe(500);
    });
  });

  describe("offline", () => {
    it("creates offline error", () => {
      const cause = new TypeError("Failed to fetch");
      const err = ApiError.offline(cause);

      expect(err).toBeInstanceOf(ApiError);
      expect(err.isOffline).toBe(true);
      expect(err.statusCode).toBe(0);
      expect(err.message).toBe("Network request failed");
    });
  });
});
