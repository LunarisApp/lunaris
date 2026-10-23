import { describe, expect, test } from "bun:test";
import {
  scrubError,
  scrubMaybe,
  scrubString,
  scrubTelemetryProperties,
} from "./scrub";

describe("scrubString", () => {
  test("redacts email addresses", () => {
    expect(scrubString("login failed for user alice@example.com")).toBe(
      "login failed for user [email]"
    );
  });

  test("redacts macOS home paths", () => {
    expect(scrubString("at /Users/alice/code/secret/file.ts:12")).toBe(
      "at /Users/[redacted]/code/secret/file.ts:12"
    );
  });

  test("redacts Linux home paths", () => {
    expect(scrubString("/home/bob/.aws/credentials missing")).toBe(
      "/home/[redacted]/.aws/credentials missing"
    );
  });

  test("redacts Windows home paths", () => {
    expect(
      scrubString(`File "C:\\Users\\carol\\Desktop\\notes.docx" not found`)
    ).toBe(`File "C:\\Users\\[redacted]\\Desktop\\notes.docx" not found`);
  });

  test("redacts JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(scrubString(`Bearer ${jwt}`)).toBe("Bearer [jwt]");
  });

  test("redacts long hex tokens", () => {
    const hex = "deadbeef".repeat(8); // 64 chars
    expect(scrubString(`token=${hex}`)).toBe("token=[token]");
  });

  test("redacts bearer credentials and secret query parameters", () => {
    expect(scrubString("Bearer abcdefghijklmnopqrstuvwxyz")).toBe(
      "Bearer [token]"
    );
    expect(
      scrubString("https://example.com/callback?code=secret-code&safe=yes")
    ).toBe("https://example.com/callback?code=[redacted]&safe=yes");
  });

  test("preserves harmless strings", () => {
    expect(scrubString("validation failed for field name")).toBe(
      "validation failed for field name"
    );
  });

  test("redacts multiple PII types in one pass", () => {
    const hex = "deadbeef".repeat(8);
    const input = `alice@example.com loaded /Users/alice/secret with token ${hex}`;
    const output = scrubString(input);
    expect(output).toContain("[email]");
    expect(output).toContain("/Users/[redacted]");
    expect(output).toContain("[token]");
    expect(output).not.toContain("alice@");
    expect(output).not.toContain("/Users/alice");
  });
});

describe("scrubMaybe", () => {
  test("passes undefined through", () => {
    expect(scrubMaybe(undefined)).toBeUndefined();
  });

  test("scrubs strings", () => {
    expect(scrubMaybe("a@b.co")).toBe("[email]");
  });
});

describe("scrubError", () => {
  test("scrubs message and stack on Error instances", () => {
    const err = new Error("user a@b.co failed at /Users/alice/file.ts");
    const cleaned = scrubError(err);
    expect(cleaned).toBeInstanceOf(Error);
    expect(cleaned.message).toBe(
      "user [email] failed at /Users/[redacted]/file.ts"
    );
    expect(cleaned.stack ?? "").not.toContain("a@b.co");
    expect(cleaned.stack ?? "").not.toContain("/Users/alice");
  });

  test("preserves error name", () => {
    class CustomError extends Error {
      override name = "CustomError";
    }
    const cleaned = scrubError(new CustomError("oops"));
    expect(cleaned.name).toBe("CustomError");
  });

  test("scrubs non-Error thrown values recursively", () => {
    expect(scrubError("plain string")).toBe("plain string");
    expect(scrubError(42)).toBe(42);
    expect(scrubError(null)).toBe(null);
    expect(
      scrubError({
        message: "Failed for writer@example.com",
        nested: { path: "/Users/writer/private.txt" },
        session: { id: "session-secret" },
      })
    ).toEqual({
      message: "Failed for [email]",
      nested: { path: "/Users/[redacted]/private.txt" },
      session: "[redacted]",
    });
  });
});

describe("scrubTelemetryProperties", () => {
  test("removes query strings and fragments from telemetry URLs", () => {
    expect(
      scrubTelemetryProperties({
        $current_url:
          "https://app.example.com/auth/callback?code=secret#fragment",
        $request_path:
          "/documents/doc_a1b2c3d4e5f6g7h8i9j0?redirectTo=/private",
        safe: "kept",
      })
    ).toEqual({
      $current_url: "https://app.example.com/auth/callback",
      $request_path: "/documents/:id",
      safe: "kept",
    });
  });

  test("redacts UUID and opaque URL path identifiers", () => {
    expect(
      scrubTelemetryProperties({
        $current_url:
          "https://api.example.com/organizations/018f6b5e-1a2b-7c3d-8e4f-123456789abc/workspaces",
        url: "/attachments/zR8pqVt2nK4mX6cB9sD1fG3hJ5/download",
      })
    ).toEqual({
      $current_url: "https://api.example.com/organizations/:id/workspaces",
      url: "/attachments/:id/download",
    });
  });

  test("recursively redacts sensitive values", () => {
    expect(
      scrubTelemetryProperties({
        error: { email: "writer@example.com", message: "failed" },
      })
    ).toEqual({
      error: { email: "[redacted]", message: "failed" },
    });
  });
});

describe("device authorization telemetry", () => {
  test("removes device codes and signed authorization queries", () => {
    expect(
      scrubString(
        "/auth/device?user_code=ABCD-EFGH&device_code=private&oauth_query=signed&sig=secret"
      )
    ).toBe(
      "/auth/device?user_code=[redacted]&device_code=[redacted]&oauth_query=[redacted]&sig=[redacted]"
    );
  });
});
