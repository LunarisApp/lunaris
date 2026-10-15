import type { LunarisTauriStorage } from "@repo/auth/tauri-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrent, onOpenUrl } = vi.hoisted(() => ({
  getCurrent: vi.fn(),
  onOpenUrl: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-deep-link", () => ({ getCurrent, onOpenUrl }));

import {
  processDesktopDeepLinks,
  registerDesktopDeepLinks,
  sanitizeDeepLink,
} from "./deep-link";

function memoryStorage(events: string[] = []) {
  const values = new Map<string, string>();
  const storage: LunarisTauriStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      events.push("persist");
      values.set(key, value);
    },
  };
  return { storage, values };
}

beforeEach(() => {
  getCurrent.mockReset();
  onOpenUrl.mockReset();
});

describe("sanitizeDeepLink", () => {
  it("accepts internal auth callbacks and removes secrets", () => {
    expect(
      sanitizeDeepLink(
        "lunaris://auth/reset-password?token=reset-token&Cookie=session%3Dsecret&authSession=secret&region=eu",
      ),
    ).toBe("/auth/reset-password?token=reset-token&region=eu");
  });

  it("accepts the post-OAuth root callback", () => {
    expect(sanitizeDeepLink("lunaris://?cookie=secret&region=us")).toBe(
      "/?region=us",
    );
  });

  it.each([
    "https://lunaris.app/auth/verify-email",
    "lunaris://workspaces/private",
    "lunaris:auth",
    "lunaris://auth#session=secret",
    "not a url",
  ])("rejects untrusted deep link %s", (value) => {
    expect(sanitizeDeepLink(value)).toBeNull();
  });
});

describe("desktop deep-link processing", () => {
  it("checks cold-start links while registering the listener", async () => {
    let resolveListener: ((unlisten: () => void) => void) | undefined;
    onOpenUrl.mockReturnValue(
      new Promise((resolve) => {
        resolveListener = resolve;
      }),
    );
    getCurrent.mockResolvedValue([]);
    const { storage } = memoryStorage();

    const registration = registerDesktopDeepLinks({ storage });

    expect(onOpenUrl).toHaveBeenCalledOnce();
    expect(getCurrent).toHaveBeenCalledOnce();
    resolveListener?.(vi.fn());
    await registration;
  });

  it("persists cold-start cookies before sanitized routing", async () => {
    const events: string[] = [];
    const { storage, values } = memoryStorage(events);
    onOpenUrl.mockImplementation(async () => {
      events.push("listen");
      return vi.fn();
    });
    getCurrent.mockImplementation(async () => {
      events.push("current");
      return [
        "lunaris://?cookie=lunaris.session_token%3Dtoken%3B%20Path%3D%2F%2C%20lunaris.last_used_login_method%3Dgoogle%3B%20Max-Age%3D2592000%3B%20Path%3D%2F&region=eu",
      ];
    });

    await registerDesktopDeepLinks({
      route: (route) => events.push(`route:${route}`),
      storage,
    });

    expect(events).toEqual(["listen", "current", "persist", "route:/?region=eu"]);
    expect(values.get("lunaris-auth-eu_cookie")).toContain("session_token");
    expect(values.get("lunaris-auth-eu_cookie")).toContain(
      "last_used_login_method",
    );
  });

  it("processes running callbacks through the same persistence path", async () => {
    const { storage, values } = memoryStorage();
    let handler: ((urls: string[]) => void) | undefined;
    onOpenUrl.mockImplementation(async (callback) => {
      handler = callback;
      return vi.fn();
    });
    getCurrent.mockResolvedValue([]);
    await registerDesktopDeepLinks({ route: vi.fn(), storage });

    handler?.([
      "lunaris://auth?cookie=lunaris.session_token%3Drunning&region=us",
    ]);

    await vi.waitFor(() =>
      expect(values.get("lunaris-auth-us_cookie")).toContain("running"),
    );
  });

  it("never persists callbacks without a valid region", async () => {
    const { storage, values } = memoryStorage();
    const route = vi.fn();

    await processDesktopDeepLinks(
      ["lunaris://?cookie=lunaris.session_token%3Dsecret&region=../bad"],
      { route, storage },
    );

    expect(values.size).toBe(0);
    expect(route).toHaveBeenCalledWith("/");
  });

  it("sanitizes routing even when keychain persistence fails", async () => {
    const route = vi.fn();
    const storage: LunarisTauriStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("keychain unavailable");
      },
    };

    await expect(
      processDesktopDeepLinks(
        ["lunaris://auth?cookie=lunaris.session_token%3Dsecret&region=eu"],
        { route, storage },
      ),
    ).rejects.toThrow("Failed to persist desktop auth callback");
    expect(route).toHaveBeenCalledWith("/auth?region=eu");
  });
});
