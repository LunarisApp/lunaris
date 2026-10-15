import { render, screen } from "@testing-library/react";
import { createBrowserPlatform, PlatformProvider } from "@repo/platform";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context";
import {
  readLastLoginMethodCookie,
  useLastLoginMethod,
} from "./use-last-login-method";

function MethodProbe() {
  return <span>{useLastLoginMethod() ?? "none"}</span>;
}

function renderMethod(
  client: Record<string, unknown>,
  platformKind: "desktop" | "web" = "web",
) {
  return render(
    <PlatformProvider platform={createBrowserPlatform({ kind: platformKind })}>
      <AuthProvider client={client as never}>
        <MethodProbe />
      </AuthProvider>
    </PlatformProvider>,
  );
}

describe("useLastLoginMethod", () => {
  it.each(["email", "google"] as const)(
    "returns visible browser method %s",
    (method) => {
      renderMethod({ getLastUsedLoginMethod: () => method });

      expect(screen.getByText(method)).toBeTruthy();
    },
  );

  it.each(["anonymous", "passkey", "unknown", null])(
    "ignores non-visible method %s",
    (method) => {
      renderMethod({ getLastUsedLoginMethod: () => method });

      expect(screen.getByText("none")).toBeTruthy();
    },
  );

  it("falls back to persisted Tauri cookies", async () => {
    const getCookie = vi
      .fn()
      .mockResolvedValue(
        "lunaris.session_token=secret; lunaris.last_used_login_method=google",
      );
    renderMethod({ getCookie, getLastUsedLoginMethod: () => null }, "desktop");

    expect(await screen.findByText("google")).toBeTruthy();
    expect(getCookie).toHaveBeenCalledOnce();
  });

  it("ignores failed Tauri cookie reads", async () => {
    renderMethod(
      {
        getCookie: vi.fn().mockRejectedValue(new Error("keychain unavailable")),
        getLastUsedLoginMethod: () => null,
      },
      "desktop",
    );

    expect(await screen.findByText("none")).toBeTruthy();
  });

  it("does not probe desktop cookie actions in the web shell", () => {
    const getCookie = vi.fn().mockResolvedValue("");
    renderMethod({ getCookie, getLastUsedLoginMethod: () => null });

    expect(screen.getByText("none")).toBeTruthy();
    expect(getCookie).not.toHaveBeenCalled();
  });
});

describe("readLastLoginMethodCookie", () => {
  it("matches only the exact Lunaris cookie", () => {
    expect(
      readLastLoginMethodCookie(
        "other.last_used_login_method=google; lunaris.last_used_login_method=email",
      ),
    ).toBe("email");
    expect(
      readLastLoginMethodCookie("lunaris.last_used_login_method=passkey"),
    ).toBeNull();
  });
});
