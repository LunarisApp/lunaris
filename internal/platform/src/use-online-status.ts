import { useSyncExternalStore } from "react";
import { usePlatform } from "./context";

export function useOnlineStatus(): boolean {
  const { network } = usePlatform();

  return useSyncExternalStore(network.subscribe, network.isOnline, () => true);
}
