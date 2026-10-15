import { describe, expect, test } from "bun:test";
import { serializeErrorForLog } from "./log-error";

describe("serializeErrorForLog", () => {
  test("keeps stack and nested cause in JSON", () => {
    const cause = new Error("key failed");
    const error = new Error("Desktop request failed", { cause });

    const result = serializeErrorForLog(error);

    expect(result).toMatchObject({
      cause: { message: "key failed", name: "Error" },
      message: "Desktop request failed",
      name: "Error",
      status: 500,
    });
    expect(result.stack).toContain("Desktop request failed");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test("scrubs PII from messages and stacks", () => {
    const error = new Error(
      "Failed for writer@example.com in /Users/mrlightful/Documents",
    );

    const result = serializeErrorForLog(error);

    expect(result.message).toBe(
      "Failed for [email] in /Users/[redacted]/Documents",
    );
    expect(result.stack).not.toContain("writer@example.com");
    expect(result.stack).not.toContain("/Users/mrlightful");
  });
});
