import {
  type LunarisTauriStorage,
  persistLunarisAuthCookies,
} from "@repo/auth/tauri-client";
import {
  isValidLunarisRegionId,
  parseLunarisAuthCallbackUrl,
} from "@repo/auth/tauri-shared";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";

interface ParsedDeepLink {
  authCookie?: string;
  regionId?: string;
  route: string;
}

interface DeepLinkOptions {
  onError?: (error: Error) => void;
  route?: (route: string) => void;
  storage: LunarisTauriStorage;
}

export function parseDesktopDeepLink(value: string): ParsedDeepLink | null {
  const callback = parseLunarisAuthCallbackUrl(value);
  if (!callback) return null;
  const { path, url } = callback;

  let authCookie: string | undefined;
  for (const [name, value] of [...url.searchParams.entries()]) {
    const normalized = name.toLowerCase();
    if (normalized === "cookie") authCookie = value;
    if (normalized.includes("cookie") || normalized.includes("session")) {
      url.searchParams.delete(name);
    }
  }

  const rawRegionId = url.searchParams.get("region") ?? undefined;
  const regionId =
    rawRegionId && isValidLunarisRegionId(rawRegionId)
      ? rawRegionId
      : undefined;
  if (rawRegionId && !regionId) url.searchParams.delete("region");

  return {
    ...(authCookie && regionId ? { authCookie, regionId } : {}),
    route: `${path}${url.search}`,
  };
}

export function sanitizeDeepLink(value: string) {
  return parseDesktopDeepLink(value)?.route ?? null;
}

function routeInBrowser(route: string) {
  window.history.replaceState(null, "", route);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export async function processDesktopDeepLinks(
  urls: string[],
  options: DeepLinkOptions,
) {
  for (const value of urls) {
    const parsed = parseDesktopDeepLink(value);
    if (!parsed) continue;

    let persistenceError: unknown;
    if (parsed.authCookie && parsed.regionId) {
      try {
        await persistLunarisAuthCookies({
          regionId: parsed.regionId,
          setCookie: parsed.authCookie,
          storage: options.storage,
        });
      } catch (error) {
        persistenceError = error;
      }
    }

    (options.route ?? routeInBrowser)(parsed.route);
    if (persistenceError) {
      throw new Error("Failed to persist desktop auth callback", {
        cause: persistenceError,
      });
    }
    return true;
  }
  return false;
}

export async function registerDesktopDeepLinks(options: DeepLinkOptions) {
  const reportError = (error: unknown) => {
    options.onError?.(
      error instanceof Error ? error : new Error("Desktop deep-link failed"),
    );
  };
  const handleOpenUrl = (urls: string[]) => {
    processDesktopDeepLinks(urls, options).catch(reportError);
  };

  const [unlisten, currentUrls] = await Promise.all([
    onOpenUrl(handleOpenUrl),
    getCurrent(),
  ]);
  await processDesktopDeepLinks(currentUrls ?? [], options);
  return unlisten;
}
