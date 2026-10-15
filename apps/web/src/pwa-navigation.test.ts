import { describe, expect, it } from "vitest";
import { navigateFallbackDenylist } from "../scripts/pwa-navigation";

const bypassesShell = (url: string) =>
  navigateFallbackDenylist.some((pattern) => pattern.test(url));

describe("PWA navigation routing", () => {
  it.each([
    "/auth", "/auth/?region=selfhost", "/auth/email",
    "/auth/reset-password?token=reset-token", "/auth/verify-email?region=selfhost",
    "/auth/agent-consent?client_id=example", "/workspaces/example",
  ])("serves offline shell for %s", (url) => {
    expect(bypassesShell(url)).toBe(false);
  });
  it.each([
    "/auth/jwks", "/auth/get-session", "/auth/callback/google?code=test",
    "/auth/verify-email?token=test", "/auth/verify-email?callbackURL=%2F&token=test",
    "/auth/reset-password/reset-token", "/v1/manifest", "/sync/stream",
    "/lunaris/file", "/.well-known/lunaris-servers", "/regions.json",
  ])("preserves network endpoint %s", (url) => {
    expect(bypassesShell(url)).toBe(true);
  });
});
