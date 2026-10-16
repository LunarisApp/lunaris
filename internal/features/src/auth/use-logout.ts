import { usePowerSyncSession } from "@repo/data/core";
import { createLogoutNavigationState } from "@repo/features/auth/redirect";
import { useRegion, useRegionClients } from "@repo/features/region";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { logout } from "./logout";

export function useLogout() {
  const { authClient, manifest } = useRegionClients();
  const powerSyncSession = usePowerSyncSession();
  const { pathWithRegion } = useRegion();
  const location = useLocation();
  const navigate = useNavigate();

  return useCallback(async () => {
    if (!(authClient && manifest)) {
      return;
    }

    const authPath = pathWithRegion("/auth");
    const previousPath = `${location.pathname}${location.search}${location.hash}`;
    let authNavigationStarted = false;

    try {
      await logout({
        authClient,
        beforeSignOut: () => {
          authNavigationStarted = true;
          navigate(authPath, {
            replace: true,
            state: createLogoutNavigationState(),
          });
        },
        powerSyncSession,
      });
    } catch (error) {
      if (authNavigationStarted) {
        navigate(previousPath, { replace: true, state: null });
      }
      throw error;
    }
  }, [
    authClient,
    location.hash,
    location.pathname,
    location.search,
    manifest,
    navigate,
    pathWithRegion,
    powerSyncSession,
  ]);
}
