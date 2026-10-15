import { PluginError, StorageError, SyncError } from "@repo/utils";
import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import {
  getUserFacingDescription,
  getUserFacingError,
} from "./user-facing-error";

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getUserFacingError", () => {
  it("uses status fallback for the retired item-limit reason", async () => {
    const error = await ApiError.fromResponse(jsonResponse({
      reason: "entitlements.organization_item_limit_reached",
      requestId: "legacy-request",
    }, 403));
    expect(error.reason).toBeUndefined();
    const statusOnlyError = await ApiError.fromResponse(jsonResponse({
      requestId: "legacy-request",
    }, 403));
    expect(getUserFacingError(error)).toEqual(getUserFacingError(statusOnlyError));
  });
  it("maps offline ApiError to network.offline keys with retry hint", () => {
    const err = ApiError.offline(new TypeError("net"));
    const ufe = getUserFacingError(err);
    expect(ufe.titleKey).toBe("errors.network.offline.title");
    expect(ufe.descriptionKey).toBe("errors.network.offline.desc");
    expect(ufe.retry).toBe(true);
  });

  it("maps a typed reason from ApiError to its registered keys", async () => {
    const err = await ApiError.fromResponse(
      jsonResponse(
        {
          statusCode: 403,
          message: "Cloud sync is disabled for this session",
          reason: "entitlements.organization_resource_limit_reached",
          requestId: "req-123",
        },
        403
      )
    );
    const ufe = getUserFacingError(err);
    expect(ufe.titleKey).toBe("errors.reason.entitlements.resourceLimit.title");
    expect(ufe.descriptionKey).toBe(
      "errors.reason.entitlements.resourceLimit.desc"
    );
    expect(ufe.requestId).toBe("req-123");
  });

  it("falls back to status bucket when no reason is present", async () => {
    const err = await ApiError.fromResponse(
      jsonResponse({ statusCode: 404 }, 404)
    );
    const ufe = getUserFacingError(err);
    expect(ufe.titleKey).toBe("errors.http.notFound.title");
  });

  it("maps 5xx without a reason to server.internal", async () => {
    const err = await ApiError.fromResponse(
      jsonResponse({ statusCode: 502 }, 502)
    );
    const ufe = getUserFacingError(err);
    expect(ufe.titleKey).toBe("errors.server.title");
    expect(ufe.retry).toBe(true);
  });

  it("maps 429 to ratelimit.exceeded", async () => {
    const err = await ApiError.fromResponse(
      jsonResponse({ statusCode: 429 }, 429)
    );
    const ufe = getUserFacingError(err);
    expect(ufe.titleKey).toBe("errors.ratelimit.title");
    expect(ufe.retry).toBe(true);
  });

  it("maps frontend SyncError to client.sync_failure keys", () => {
    const ufe = getUserFacingError(new SyncError("sync borked"));
    expect(ufe.titleKey).toBe("errors.client.sync.title");
    expect(ufe.retry).toBe(true);
  });

  it("maps frontend StorageError to client.storage_failure keys", () => {
    const ufe = getUserFacingError(new StorageError("disk full"));
    expect(ufe.titleKey).toBe("errors.client.storage.title");
  });

  it("maps frontend PluginError to client.plugin_failure keys", () => {
    const ufe = getUserFacingError(new PluginError("extension crash"));
    expect(ufe.titleKey).toBe("errors.client.extension.title");
  });

  it("returns generic unknown for plain Errors", () => {
    const ufe = getUserFacingError(new Error("???"));
    expect(ufe.titleKey).toBe("errors.unknown.title");
    expect(ufe.descriptionKey).toBe("errors.unknown.desc");
  });

  it("returns generic unknown for non-Error throws", () => {
    expect(getUserFacingError("string thrown").titleKey).toBe(
      "errors.unknown.title"
    );
    expect(getUserFacingError(undefined).titleKey).toBe(
      "errors.unknown.title"
    );
  });

  it("maps a known Better Auth code to its registered keys", () => {
    const err = {
      code: "ORGANIZATION_SLUG_ALREADY_TAKEN",
      message: "Organization slug already taken",
      status: 409,
    };
    const ufe = getUserFacingError(err);
    expect(ufe.titleKey).toBe("errors.reason.auth.orgSlugTaken.title");
    expect(ufe.descriptionKey).toBe("errors.reason.auth.orgSlugTaken.desc");
    expect(ufe.description).toBeUndefined();
  });

  it("surfaces err.message as literal description for unmapped Better Auth codes", () => {
    const err = {
      code: "SOME_NEW_CODE_WE_HAVENT_MAPPED",
      message: "Something very specific went wrong",
      status: 400,
    };
    const ufe = getUserFacingError(err);
    expect(ufe.titleKey).toBe("errors.auth.title");
    expect(ufe.description).toBe("Something very specific went wrong");
  });

  it("falls back to status bucket for unmapped Better Auth codes with no message", () => {
    const err = { code: "UNKNOWN_CODE", status: 404 };
    const ufe = getUserFacingError(err);
    expect(ufe.titleKey).toBe("errors.http.notFound.title");
    expect(ufe.description).toBeUndefined();
  });
});

describe("getUserFacingDescription", () => {
  it("prefers literal description over descriptionKey", () => {
    const t = (key: string) => `translated:${key}`;
    const resolved = getUserFacingDescription(
      {
        titleKey: "errors.auth.title",
        descriptionKey: "errors.unknown.desc",
        description: "Raw server message",
      },
      t
    );
    expect(resolved).toBe("Raw server message");
  });

  it("falls back to t(descriptionKey) when no literal present", () => {
    const t = (key: string) => `translated:${key}`;
    const resolved = getUserFacingDescription(
      {
        titleKey: "errors.unknown.title",
        descriptionKey: "errors.unknown.desc",
      },
      t
    );
    expect(resolved).toBe("translated:errors.unknown.desc");
  });
});
