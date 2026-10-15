import type {
  OperatingSystem,
  Platform,
  PlatformKind,
  PlatformPlugins,
  PluginArtifactStore,
} from "./platform";

export interface BrowserPlatformOptions
  extends Pick<Platform, "agentAccess" | "agentWork" | "panelWindows"> {
  kind: PlatformKind;
  plugins?: PlatformPlugins;
}

const PLUGIN_CACHE = "lunaris-extension-artifacts-v1";
const pluginCacheRequestKey = (key: string) =>
  `https://cache.lunaris.invalid/${encodeURIComponent(key)}`;

export function createBrowserPluginArtifactStore(): PluginArtifactStore {
  return {
    async delete(key) {
      if (!("caches" in globalThis)) return;
      const cache = await caches.open(PLUGIN_CACHE);
      await cache.delete(pluginCacheRequestKey(key));
    },
    async get(key) {
      if (!("caches" in globalThis)) return null;
      const cache = await caches.open(PLUGIN_CACHE);
      const response = await cache.match(pluginCacheRequestKey(key));
      return response ? new Uint8Array(await response.arrayBuffer()) : null;
    },
    async put(key, value) {
      if (!("caches" in globalThis)) return;
      const cache = await caches.open(PLUGIN_CACHE);
      await cache.put(
        pluginCacheRequestKey(key),
        new Response(Uint8Array.from(value).buffer),
      );
    },
  };
}

export function createBrowserPluginFetch(
  sourceFetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): typeof globalThis.fetch {
  const pluginFetch = (input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => {
    const sourceRequest = input instanceof Request ? input : undefined;
    const url = new URL(sourceRequest?.url ?? String(input), window.location.href);
    const isLocalDevelopment =
      import.meta.env.DEV &&
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !isLocalDevelopment) {
      return Promise.reject(
        new TypeError("Extension network requests must use HTTPS"),
      );
    }
    return sourceFetch(input, {
      ...init,
      credentials: init?.credentials ?? "omit",
    });
  };
  return pluginFetch as typeof globalThis.fetch;
}

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    platform?: string;
  };
}

export function detectOperatingSystem(
  platform: string | undefined,
): OperatingSystem {
  const normalized = platform?.toLowerCase() ?? "";
  if (normalized.includes("mac")) return "mac";
  if (normalized.includes("win")) return "windows";
  if (normalized.includes("linux")) return "linux";
  return "unknown";
}

export function getOperatingSystem(): OperatingSystem | undefined {
  if (typeof navigator === "undefined") return undefined;
  const browserNavigator = navigator as NavigatorWithUserAgentData;
  return detectOperatingSystem(
    browserNavigator.userAgentData?.platform ?? browserNavigator.platform,
  );
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function subscribeToOnlineStatus(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function subscribeToOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  return () => window.removeEventListener("online", listener);
}

export function createBrowserPlatform({
  agentAccess,
  agentWork,
  kind,
  panelWindows,
  plugins,
}: BrowserPlatformOptions): Platform {
  return {
    agentAccess,
    agentWork,
    clipboard: {
      writeText: (text) => navigator.clipboard.writeText(text),
    },
    downloads: {
      downloadUrl: (url, filename) => {
        const link = document.createElement("a");
        link.download = filename;
        link.href = url;
        link.rel = "noopener";
        link.click();
      },
    },
    kind,
    navigation: {
      assign: (url) => window.location.assign(url),
      currentUrl: () => window.location.href,
      open: (url) => {
        window.open(url);
      },
      origin: () => window.location.origin,
      reload: () => window.location.reload(),
    },
    network: {
      isOnline,
      subscribe: subscribeToOnlineStatus,
      subscribeOnline: subscribeToOnline,
    },
    operatingSystem: getOperatingSystem,
    panelWindows,
    plugins:
      plugins ??
      {
        artifacts: createBrowserPluginArtifactStore(),
        fetch: createBrowserPluginFetch(),
      },
    viewport: {
      width: () => window.innerWidth,
    },
  };
}
