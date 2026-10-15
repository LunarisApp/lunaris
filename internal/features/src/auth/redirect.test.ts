import { describe, expect, it } from "vitest";
import {
  appendRedirectToUrl,
  buildAddAccountPath,
  buildAuthRedirectPath,
  createAccountSwitchNavigationState,
  createLogoutNavigationState,
  getAccountSwitchTargetUserId,
  isLogoutNavigationState,
  resolveRedirectTo,
} from "./redirect";

describe("auth redirect helpers", () => {
  it("round-trips account switch navigation state", () => {
    const state = createAccountSwitchNavigationState("user-2");

    expect(getAccountSwitchTargetUserId(state)).toBe("user-2");
    expect(getAccountSwitchTargetUserId(null)).toBeNull();
    expect(
      getAccountSwitchTargetUserId({ accountSwitchTargetUserId: 2 }),
    ).toBeNull();
  });

  it("round-trips logout navigation state", () => {
    const state = createLogoutNavigationState();

    expect(isLogoutNavigationState(state)).toBe(true);
    expect(isLogoutNavigationState(null)).toBe(false);
    expect(isLogoutNavigationState({ logoutPending: "true" })).toBe(false);
  });

  it("builds auth redirect path from current location", () => {
    const authPath = buildAuthRedirectPath("/auth?region=us", {
      hash: "#outline",
      pathname: "/workspaces/novel",
      search: "?region=us&view=board",
    });
    const url = new URL(authPath, "https://lunaris.app");

    expect(url.pathname).toBe("/auth");
    expect(url.searchParams.get("region")).toBe("us");
    expect(url.searchParams.get("redirectTo")).toBe(
      "/workspaces/novel?region=us&view=board#outline",
    );
  });

  it("builds add-account path without signing out the active account", () => {
    const path = buildAddAccountPath("/auth?region=us", {
      hash: "#outline",
      pathname: "/organization/workspace",
      search: "?region=us",
    });
    const url = new URL(path, "https://lunaris.app");

    expect(url.pathname).toBe("/auth");
    expect(url.searchParams.get("addAccount")).toBe("true");
    expect(url.searchParams.get("redirectTo")).toBe(
      "/organization/workspace?region=us#outline",
    );
  });

  it("builds a root add-account path when no return location is given", () => {
    const path = buildAddAccountPath("/auth?region=us");
    const url = new URL(path, "https://lunaris.app");

    expect(url.searchParams.get("addAccount")).toBe("true");
    expect(url.searchParams.get("redirectTo")).toBeNull();
  });

  it("falls back for invalid external redirect targets", () => {
    expect(
      resolveRedirectTo({
        fallbackPath: "/?region=us",
        redirectTo: "https://evil.example/steal",
        regionId: "us",
      }),
    ).toBe("/?region=us");
  });

  it("falls back for auth-loop redirect targets", () => {
    expect(
      resolveRedirectTo({
        fallbackPath: "/?region=us",
        redirectTo: "/auth/email?region=us",
        regionId: "us",
      }),
    ).toBe("/?region=us");
  });

  it("allows post-auth invitation redirects", () => {
    expect(
      resolveRedirectTo({
        fallbackPath: "/?region=us",
        redirectTo: "/auth/accept-invitation?invitationId=invite-1",
        regionId: "us",
      }),
    ).toBe(
      "/auth/accept-invitation?invitationId=invite-1&region=us",
    );
  });

  it("adds current region when redirect target omits it", () => {
    expect(
      resolveRedirectTo({
        fallbackPath: "/?region=us",
        redirectTo: "/workspaces#team",
        regionId: "us",
      }),
    ).toBe("/workspaces?region=us#team");
  });

  it("preserves redirect target region when already present", () => {
    expect(
      resolveRedirectTo({
        fallbackPath: "/?region=us",
        redirectTo: "/workspaces?region=eu#team",
        regionId: "us",
      }),
    ).toBe("/workspaces?region=eu#team");
  });

  it("adds redirectTo to callback urls", () => {
    expect(
      appendRedirectToUrl(
        "https://lunaris.app/auth/verify-email?region=us",
        "/workspaces?region=us#team",
      ),
    ).toBe(
      "https://lunaris.app/auth/verify-email?region=us&redirectTo=%2Fworkspaces%3Fregion%3Dus%23team",
    );
  });
});
