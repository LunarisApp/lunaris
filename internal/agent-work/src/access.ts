import { FEATURE } from "@repo/auth/entitlements";
import { useFeatureAccess } from "@repo/features/entitlements";
import { usePlatform } from "@repo/platform";

export function useAgentWorkAccess() {
  const platform = usePlatform();
  const access = useFeatureAccess(FEATURE.agentWork);
  return platform.kind === "web" && platform.agentWork?.preview
    ? { allowed: true, pending: false }
    : access;
}
