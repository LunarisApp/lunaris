import type { PowerSyncSessionFactory } from "@repo/data/core";
import type { PermissionCheck } from "@repo/features/permissions";
import type { RegionClientFactory } from "@repo/features/region";
import type { CookieSettingsLinkProps } from "@repo/features/settings/types";
import type { Platform } from "@repo/platform";
import { type ComponentType, createContext, useContext } from "react";
import type { AppUpdateState } from "@repo/features/app-update";

export interface AppRuntime {
  agentSessionBridge?: ComponentType;
  appUpdate?: AppUpdateState;
  authCallbackBaseUrl?: string;
  cookieSettingsLink?: ComponentType<CookieSettingsLinkProps>;
  createPowerSyncSession: PowerSyncSessionFactory;
  createRegionClients?: RegionClientFactory;
  localContentBridge?: ComponentType;
  permissionCheck?: PermissionCheck;
  platform: Platform;
}

export const AppRuntimeContext = createContext<AppRuntime | null>(null);

export function useAppRuntime(): AppRuntime {
  const runtime = useContext(AppRuntimeContext);
  if (!runtime) {
    throw new Error("App runtime is not configured");
  }
  return runtime;
}
