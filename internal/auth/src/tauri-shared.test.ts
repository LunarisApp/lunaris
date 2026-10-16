import { describe, expect, it } from "bun:test";
import {
  isValidLunarisOAuthCallbackUrl,
  isValidLunarisRegionId,
  parseLunarisAuthCallbackUrl,
} from "./tauri-shared";

describe("Tauri shared conventions", () => {
  it("accepts only region IDs that fit keychain keys", () => {
    expect(isValidLunarisRegionId("eu-west_1.preview")).toBe(true);
    expect(isValidLunarisRegionId("../eu")).toBe(false);
    expect(isValidLunarisRegionId("x".repeat(103))).toBe(false);
  });

  it.each([
    ["lunaris://", "/"],
    ["lunaris://auth", "/auth"],
    ["lunaris:///auth/reset-password?region=eu", "/auth/reset-password"],
  ])("parses approved auth callback %s", (value, path) => {
    expect(parseLunarisAuthCallbackUrl(value)?.path).toBe(path);
  });

  it.each([
    "https://lunaris.app/auth",
    "lunaris:auth",
    "lunaris://workspaces/private",
    "lunaris://user:pass@auth",
    "lunaris://auth:1234",
    "lunaris://auth#fragment",
  ])("rejects callback %s", (value) => {
    expect(parseLunarisAuthCallbackUrl(value)).toBeNull();
  });

  it.each(["lunaris://", "lunaris://auth", "lunaris:///auth?region=eu"])(
    "accepts OAuth callback %s",
    (value) => {
      expect(isValidLunarisOAuthCallbackUrl(value)).toBe(true);
    }
  );

  it.each([
    "lunaris:///auth/reset-password?region=eu",
    "lunaris://auth/verify-email",
    "lunaris://auth/accept-invitation",
    "lunaris://auth/other",
  ])("rejects OAuth callback subpath %s", (value) => {
    expect(isValidLunarisOAuthCallbackUrl(value)).toBe(false);
  });
});
