import {
  type TauriClientStorage,
  tauriClient,
} from "@dreamshive/better-auth-tauri/client";
import type { BetterAuthClientPlugin } from "better-auth/client";
import {
  parseSetCookieHeader,
  stripSecureCookiePrefix,
} from "better-auth/cookies";
import { isValidLunarisRegionId } from "./tauri-shared";

export { isValidLunarisRegionId } from "./tauri-shared";

const AUTH_STORAGE_PREFIX = "lunaris-auth-";
const COOKIE_SUFFIX = "_cookie";

interface StoredCookie {
  expires: string | null;
  value: string;
}

export type LunarisTauriStorage = TauriClientStorage;
type TauriClientActions = ReturnType<
  ReturnType<typeof tauriClient>["getActions"]
>;
type BetterAuthGetActions = NonNullable<
  BetterAuthClientPlugin["getActions"]
>;
export type LunarisTauriClientPlugin = Omit<
  BetterAuthClientPlugin,
  "getActions" | "id"
> & {
  id: "tauri";
  getActions: (...args: Parameters<BetterAuthGetActions>) => TauriClientActions;
};

function assertRegionId(regionId: string) {
  if (!isValidLunarisRegionId(regionId)) {
    throw new Error("Invalid Lunaris region ID");
  }
}

export function lunarisAuthCookieKey(regionId: string) {
  assertRegionId(regionId);
  return `${AUTH_STORAGE_PREFIX}${regionId}${COOKIE_SUFFIX}`;
}

function isAllowedCookieName(name: string) {
  const bare = stripSecureCookiePrefix(name);
  return /^lunaris\.(?:session_token(?:_multi-[a-z0-9_-]+)?|dont_remember|last_used_login_method|(?:session_data|account_data)(?:\.\d+)?)$/i.test(
    bare,
  );
}

function parseStoredCookieJar(value: string | null): Record<string, StoredCookie> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, StoredCookie] =>
          isAllowedCookieName(entry[0]) &&
          !!entry[1] &&
          typeof entry[1] === "object" &&
          "value" in entry[1] &&
          typeof entry[1].value === "string" &&
          "expires" in entry[1] &&
          (entry[1].expires === null || typeof entry[1].expires === "string"),
      ),
    );
  } catch {
    return {};
  }
}

function serializeFilteredCookieJar(value: string | null) {
  return JSON.stringify(parseStoredCookieJar(value));
}

function wrapStorage(storage: LunarisTauriStorage, cookieKey: string) {
  return {
    getItem: async (key: string) => {
      const value = await storage.getItem(key);
      return key === cookieKey ? serializeFilteredCookieJar(value) : value;
    },
    setItem: async (key: string, value: string) => {
      await storage.setItem(
        key,
        key === cookieKey ? serializeFilteredCookieJar(value) : value,
      );
    },
  } satisfies LunarisTauriStorage;
}

export function createLunarisTauriClient({
  regionId,
  storage,
}: {
  regionId: string;
  storage: LunarisTauriStorage;
}) {
  const cookieKey = lunarisAuthCookieKey(regionId);
  return tauriClient({
    cookiePrefix: "lunaris",
    scheme: "lunaris",
    storage: wrapStorage(storage, cookieKey),
    storagePrefix: `${AUTH_STORAGE_PREFIX}${regionId}`,
  }) as unknown as LunarisTauriClientPlugin;
}

export async function persistLunarisAuthCookies({
  now = Date.now(),
  regionId,
  setCookie,
  storage,
}: {
  now?: number;
  regionId: string;
  setCookie: string;
  storage: LunarisTauriStorage;
}) {
  const cookieKey = lunarisAuthCookieKey(regionId);
  const jar = parseStoredCookieJar(await storage.getItem(cookieKey));
  let changed = false;

  for (const [name, cookie] of parseSetCookieHeader(setCookie)) {
    if (!isAllowedCookieName(name)) continue;

    const maxAge = cookie["max-age"];
    const maxAgeSeconds = maxAge === undefined ? null : Number(maxAge);
    const expiresHeader = cookie.expires;
    const expiresFromHeader = expiresHeader
      ? new Date(String(expiresHeader)).getTime()
      : null;
    const expiresAt =
      maxAgeSeconds !== null && Number.isFinite(maxAgeSeconds)
        ? now + maxAgeSeconds * 1000
        : expiresFromHeader;

    if (
      (maxAgeSeconds !== null && maxAgeSeconds <= 0) ||
      (expiresAt !== null && Number.isFinite(expiresAt) && expiresAt <= now)
    ) {
      changed = delete jar[name] || changed;
      continue;
    }

    jar[name] = {
      expires:
        expiresAt !== null && Number.isFinite(expiresAt)
          ? new Date(expiresAt).toISOString()
          : null,
      value: cookie.value,
    };
    changed = true;
  }

  if (changed) await storage.setItem(cookieKey, JSON.stringify(jar));
  return changed;
}
