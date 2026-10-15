import {
  createContext,
  type PropsWithChildren,
  useContext,
} from "react";
import { createBrowserPlatform } from "./browser";
import type { Platform } from "./platform";

const fallbackPlatform = createBrowserPlatform({ kind: "web" });
const PlatformContext = createContext<Platform>(fallbackPlatform);

export interface PlatformProviderProps extends PropsWithChildren {
  platform: Platform;
}

export function PlatformProvider({
  children,
  platform,
}: PlatformProviderProps) {
  return (
    <PlatformContext.Provider value={platform}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): Platform {
  return useContext(PlatformContext);
}
