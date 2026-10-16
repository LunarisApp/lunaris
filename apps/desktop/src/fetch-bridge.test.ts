import { beforeEach, describe, expect, it, vi } from "vitest";
import * as storage from "./auth-storage";
import { createDesktopFetchBridge } from "./fetch-bridge";

vi.mock("./auth-storage", () => ({
  getAuthSecret: vi.fn(),
  setAuthSecret: vi.fn(),
}));

const apiOrigin = "https://eu.lunaris.app";

describe("desktop fetch bridge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses browser fetch untouched for foreign origins", async () => {
    const browserFetch = vi.fn(async () => new Response()) as typeof fetch;
    const nativeFetch = vi.fn(async () => new Response()) as typeof fetch;
    const bridge = createDesktopFetchBridge({
      browserFetch,
      nativeFetch,
      sessions: new Map(),
    });

    await bridge("https://storage.example/file");

    expect(browserFetch).toHaveBeenCalledOnce();
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it("isolates cookies to the selected region API origin", async () => {
    const nativeFetch = vi.fn(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-tauri-cookie")).toBe("lunaris.session_token=auth");
      expect(headers.get("tauri-origin")).toBe("lunaris://");
      expect(init?.maxRedirections).toBe(0);
      return new Response();
    });
    const bridge = createDesktopFetchBridge({
      browserFetch: vi.fn() as typeof fetch,
      nativeFetch,
      sessions: new Map([
        [
          apiOrigin,
          {
            regionId: "eu",
            getAuthCookie: async () => "lunaris.session_token=auth",
          },
        ],
      ]),
    });

    await bridge(`${apiOrigin}/v1/account`, {
      headers: {
        Cookie: "foreign=direct",
        "x-tauri-cookie": "foreign=bridged",
      },
    });
    expect(nativeFetch).toHaveBeenCalledOnce();
  });

  it("removes caller credentials when the keychain jar is empty", async () => {
    const nativeFetch = vi.fn(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.has("cookie")).toBe(false);
      expect(headers.has("x-tauri-cookie")).toBe(false);
      return new Response();
    });
    const bridge = createDesktopFetchBridge({
      browserFetch: vi.fn() as typeof fetch,
      nativeFetch,
      sessions: new Map([
        [apiOrigin, { regionId: "eu", getAuthCookie: async () => "" }],
      ]),
    });

    await bridge(`${apiOrigin}/v1/account`, {
      headers: {
        Cookie: "foreign=direct",
        "x-tauri-cookie": "foreign=bridged",
      },
    });
  });

  it("does not load or send session credentials when explicitly omitted", async () => {
    const getAuthCookie = vi.fn(async () => "lunaris.session_token=auth");
    const nativeFetch = vi.fn(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.has("x-tauri-cookie")).toBe(false);
      return new Response(null, {
        headers: {
          "set-cookie": "lunaris_csrf=ignored; Path=/; Secure",
        },
      });
    });
    const bridge = createDesktopFetchBridge({
      browserFetch: vi.fn() as typeof fetch,
      nativeFetch,
      sessions: new Map([[apiOrigin, { regionId: "eu", getAuthCookie }]]),
    });

    await bridge(`${apiOrigin}/v1/manifest`, { credentials: "omit" });

    expect(getAuthCookie).not.toHaveBeenCalled();
    expect(storage.getAuthSecret).not.toHaveBeenCalled();
    expect(storage.setAuthSecret).not.toHaveBeenCalled();
  });

  it("rejects native redirects without following their location", async () => {
    const nativeFetch = vi.fn(
      async () =>
        new Response(null, {
          headers: { location: "https://evil.example/collect" },
          status: 302,
        })
    );
    const browserFetch = vi.fn() as typeof fetch;
    const bridge = createDesktopFetchBridge({
      browserFetch,
      nativeFetch,
      sessions: new Map([
        [apiOrigin, { regionId: "eu", getAuthCookie: async () => "secret" }],
      ]),
    });

    await expect(bridge(`${apiOrigin}/redirect`)).rejects.toThrow(
      "Desktop API redirects are not allowed"
    );
    expect(nativeFetch).toHaveBeenCalledOnce();
    expect(browserFetch).not.toHaveBeenCalled();
  });

  it("returns a manual redirect without following it", async () => {
    const response = new Response(null, {
      headers: { location: `${apiOrigin}/next` },
      status: 307,
    });
    const nativeFetch = vi.fn(async () => response);
    const bridge = createDesktopFetchBridge({
      browserFetch: vi.fn() as typeof fetch,
      nativeFetch,
      sessions: new Map([
        [apiOrigin, { regionId: "eu", getAuthCookie: async () => "secret" }],
      ]),
    });

    await expect(
      bridge(`${apiOrigin}/redirect`, { redirect: "manual" })
    ).resolves.toBe(response);
    expect(nativeFetch).toHaveBeenCalledOnce();
  });
});
