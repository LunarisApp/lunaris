import { createAuthClient } from "@repo/auth/client";
import { createLunarisTauriClient } from "@repo/auth/tauri-client";
import { afterEach, expect, it, vi } from "vitest";
import {
  createDesktopAuthFetch,
  createDesktopFetchBridge,
  type RegionSessionSource,
} from "./fetch-bridge";

const { open, onOpenUrl } = vi.hoisted(() => ({
  open: vi.fn(),
  onOpenUrl: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-shell", () => ({ open }));
vi.mock("@tauri-apps/plugin-deep-link", () => ({ onOpenUrl }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onFocusChanged: vi.fn(async () => vi.fn()) }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("authenticates session requests after a Google deep-link callback", async () => {
  vi.stubGlobal("__TAURI_INTERNALS__", {});
  const values = new Map<string, string>();
  let callback: ((urls: string[]) => void) | undefined;
  onOpenUrl.mockImplementation(async (handler) => {
    callback = handler;
    return vi.fn();
  });
  const plugin = createLunarisTauriClient({
    regionId: "eu",
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    },
  });
  const nativeFetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe("omit");
      if (String(input).includes("/sign-in/social")) {
        return Response.json({
          url: "https://accounts.google.com/o/oauth2/v2/auth?state=test",
          redirect: false,
        });
      }
      const cookie = new Headers(init?.headers).get("x-tauri-cookie");
      return Response.json(
        cookie?.includes("google-session")
          ? {
              user: {
                id: "google-user",
                email: "google@example.test",
                emailVerified: true,
              },
              session: {
                id: "google-session",
                userId: "google-user",
                activeOrganizationId: "personal-workspace",
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
              },
            }
          : null
      );
    }
  );
  const sessions = new Map<string, RegionSessionSource>();
  const fetch = createDesktopFetchBridge({
    browserFetch: vi.fn(),
    nativeFetch,
    sessions,
  });
  const client = createAuthClient({
    baseURL: "https://api.example.test",
    customFetchImpl: createDesktopAuthFetch(fetch),
    passkeys: false,
    plugins: [plugin],
  });
  sessions.set("https://api.example.test", {
    regionId: "eu",
    getAuthCookie: client.getCookie,
  });
  expect((await client.getSession()).data).toBeNull();
  const signIn = client.signIn.social({
    provider: "google",
    callbackURL: "lunaris:///?region=eu",
  });
  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
  callback?.([
    "lunaris:///?region=eu&cookie=__Secure-lunaris.session_token%3Dgoogle-session%3B%20Path%3D%2F",
  ]);
  await signIn;
  expect(await client.getCookie()).toContain("google-session");
  expect((await client.getSession()).data?.user.id).toBe("google-user");
});
