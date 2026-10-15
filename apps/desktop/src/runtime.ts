import type { AppRuntime } from "@repo/app-shell";
import { createAuthClient } from "@repo/auth/client";
import { createLunarisTauriClient } from "@repo/auth/tauri-client";
import { createApiClient } from "@repo/data/http";
import type { RegionClientFactory } from "@repo/features/region";
import { createBrowserPlatform } from "@repo/platform";
import {
  DesktopAgentSessionBridge,
  desktopAgentAccess,
} from "./agent-access";
import { desktopAgentWork } from "./agent-work";
import { keychainStorage } from "./auth-storage";
import {
  installDesktopFetchBridge,
  type RegionSessionSource,
} from "./fetch-bridge";
import { DesktopLocalContentBridge } from "./local-content-bridge";
import { desktopPanelWindows } from "./panel-windows";
import { desktopPlugins } from "./extension-runtime";
import { createNativePowerSyncSession } from "./powersync";

const sessions = new Map<string, RegionSessionSource>();
const desktopFetch = installDesktopFetchBridge(sessions);

export const createDesktopRegionClients: RegionClientFactory = (manifest) => {
  const plugin = createLunarisTauriClient({
    regionId: manifest.regionId,
    storage: keychainStorage,
  });
  const authClient = createAuthClient({
    baseURL: manifest.apiUrl,
    customFetchImpl: desktopFetch,
    passkeys: false,
    plugins: [plugin],
  });

  sessions.clear();
  sessions.set(new URL(manifest.apiUrl).origin, {
    getAuthCookie: authClient.getCookie,
    regionId: manifest.regionId,
  });

  return {
    apiClient: createApiClient(manifest.apiUrl),
    authClient,
  };
};

export const desktopRuntime: AppRuntime = {
  agentSessionBridge: DesktopAgentSessionBridge,
  authCallbackBaseUrl: "lunaris://",
  createPowerSyncSession: createNativePowerSyncSession,
  createRegionClients: createDesktopRegionClients,
  localContentBridge: DesktopLocalContentBridge,
  platform: createBrowserPlatform({
    agentAccess: desktopAgentAccess,
    agentWork: desktopAgentWork,
    kind: "desktop",
    panelWindows: desktopPanelWindows,
    plugins: desktopPlugins,
  }),
};
