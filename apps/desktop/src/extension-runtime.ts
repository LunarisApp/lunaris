import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { createBrowserPluginFetch, type PlatformPlugins } from "@repo/platform";

export const desktopPlugins: PlatformPlugins = {
  artifacts: {
    delete: (key) => invoke("extension_cache_delete", { key }),
    async get(key) {
      const value = await invoke<number[] | null>("extension_cache_get", {
        key,
      });
      return value ? new Uint8Array(value) : null;
    },
    put: (key, value) =>
      invoke("extension_cache_put", { key, value: Array.from(value) }),
  },
  fetch: createBrowserPluginFetch(tauriFetch as typeof globalThis.fetch),
};
