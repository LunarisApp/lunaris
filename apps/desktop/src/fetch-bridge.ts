import {
  type ClientOptions,
  fetch as tauriFetch,
} from "@tauri-apps/plugin-http";

const DESKTOP_ORIGIN = "lunaris://";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface RegionSessionSource {
  getAuthCookie: () => Promise<string>;
  regionId: string;
}

type FetchImplementation = typeof globalThis.fetch;
type NativeFetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit & ClientOptions
) => Promise<Response>;

function requestUrl(input: RequestInfo | URL) {
  if (input instanceof Request) {
    return new URL(input.url);
  }
  return new URL(input.toString(), window.location.href);
}

export function createDesktopFetchBridge({
  browserFetch,
  nativeFetch = tauriFetch as NativeFetchImplementation,
  sessions,
}: {
  browserFetch: FetchImplementation;
  nativeFetch?: NativeFetchImplementation;
  sessions: ReadonlyMap<string, RegionSessionSource>;
}): FetchImplementation {
  return async (input, init) => {
    const url = requestUrl(input);
    const session = sessions.get(url.origin);
    if (!session) {
      return browserFetch(input, init);
    }
    const credentials =
      init?.credentials ??
      (input instanceof Request ? input.credentials : undefined);

    const headers = new Headers(
      input instanceof Request ? input.headers : undefined
    );
    new Headers(init?.headers).forEach((value, key) => {
      headers.set(key, value);
    });
    headers.delete("cookie");
    headers.delete("x-tauri-cookie");

    const authCookie =
      credentials === "omit" ? "" : await session.getAuthCookie();

    headers.set("tauri-origin", DESKTOP_ORIGIN);
    if (authCookie) {
      headers.set("x-tauri-cookie", authCookie);
    }

    const response = await nativeFetch(input, {
      ...init,
      credentials: "omit",
      headers,
      maxRedirections: 0,
    });

    const redirectMode =
      init?.redirect ?? (input instanceof Request ? input.redirect : "follow");
    if (REDIRECT_STATUSES.has(response.status) && redirectMode !== "manual") {
      await response.body?.cancel();
      throw new TypeError("Desktop API redirects are not allowed");
    }
    return response;
  };
}

export function installDesktopFetchBridge(
  sessions: ReadonlyMap<string, RegionSessionSource>
) {
  const browserFetch = globalThis.fetch.bind(globalThis);
  const bridge = createDesktopFetchBridge({ browserFetch, sessions });
  globalThis.fetch = bridge;
  return bridge;
}
