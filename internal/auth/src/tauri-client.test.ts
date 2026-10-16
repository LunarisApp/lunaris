import { describe, expect, it } from "bun:test";
import {
  createLunarisTauriClient,
  type LunarisTauriStorage,
  lunarisAuthCookieKey,
  persistLunarisAuthCookies,
} from "./tauri-client";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: LunarisTauriStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  return { storage, values };
}

describe("Lunaris Tauri client adapter", () => {
  it("uses fixed Lunaris storage conventions", () => {
    const { storage } = memoryStorage();
    expect(createLunarisTauriClient({ regionId: "eu", storage }).id).toBe(
      "tauri"
    );
    expect(lunarisAuthCookieKey("eu")).toBe("lunaris-auth-eu_cookie");
    expect(() => lunarisAuthCookieKey("../secret")).toThrow();
  });

  it("merges allowed secure and chunked cookies", async () => {
    const key = lunarisAuthCookieKey("eu");
    const { storage, values } = memoryStorage({
      [key]: JSON.stringify({
        "evil.session_token": { expires: null, value: "secret" },
        "lunaris.session_token": { expires: null, value: "old" },
      }),
    });

    await persistLunarisAuthCookies({
      now: 1000,
      regionId: "eu",
      setCookie:
        "__Secure-lunaris.session_token=new; Max-Age=60; Path=/, __Secure-lunaris.session_token_multi-abc_123=signed; Max-Age=60; Path=/, __Host-lunaris.session_data.0=chunk; Path=/, lunaris.last_used_login_method=google; Max-Age=2592000; Path=/, foreign=value; Path=/",
      storage,
    });

    expect(JSON.parse(values.get(key) ?? "{}")).toEqual({
      "__Host-lunaris.session_data.0": {
        expires: null,
        value: "chunk",
      },
      "__Secure-lunaris.session_token": {
        expires: new Date(61_000).toISOString(),
        value: "new",
      },
      "__Secure-lunaris.session_token_multi-abc_123": {
        expires: new Date(61_000).toISOString(),
        value: "signed",
      },
      "lunaris.session_token": { expires: null, value: "old" },
      "lunaris.last_used_login_method": {
        expires: new Date(2_592_001_000).toISOString(),
        value: "google",
      },
    });
  });

  it("returns the persisted last login method through the Tauri cookie action", async () => {
    const key = lunarisAuthCookieKey("eu");
    const { storage } = memoryStorage({
      [key]: JSON.stringify({
        "__Secure-lunaris.last_used_login_method": {
          expires: "1970-01-01T00:00:00.000Z",
          value: "google",
        },
        "lunaris.last_used_login_method": {
          expires: null,
          value: "email",
        },
        "other.last_used_login_method": {
          expires: null,
          value: "google",
        },
      }),
    });
    const plugin = createLunarisTauriClient({ regionId: "eu", storage });
    if (!plugin.getActions) {
      throw new Error("Tauri client actions are missing");
    }
    const actions = plugin.getActions({} as never, {} as never, undefined);

    await expect(actions.getCookie()).resolves.toBe(
      "lunaris.last_used_login_method=email"
    );
  });

  it("applies expiry and deletion without storing foreign cookies", async () => {
    const key = lunarisAuthCookieKey("us");
    const { storage, values } = memoryStorage({
      [key]: JSON.stringify({
        "lunaris.account_data": { expires: null, value: "account" },
        "lunaris.session_token": { expires: null, value: "session" },
      }),
    });

    await persistLunarisAuthCookies({
      now: 10_000,
      regionId: "us",
      setCookie:
        "lunaris.session_token=; Max-Age=0, lunaris.account_data=; Expires=Thu, 01 Jan 1970 00:00:00 GMT, evil.session_token=secret",
      storage,
    });

    expect(JSON.parse(values.get(key) ?? "{}")).toEqual({});
  });
});
