import { expect, test } from "bun:test";
import { canDisableEmailVerification } from "./flag.utils";

test("hosted production enforces email verification", () => {
  expect(canDisableEmailVerification("production", true, false)).toBe(false);
});
test("self-hosted production requires explicit opt-out", () => {
  expect(canDisableEmailVerification("production", true, true)).toBe(true);
  expect(canDisableEmailVerification("production", false, true)).toBe(false);
});
test("development opt-out remains supported", () => {
  expect(canDisableEmailVerification("development", true, false)).toBe(true);
});
