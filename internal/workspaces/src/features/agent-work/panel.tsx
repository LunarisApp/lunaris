import { FEATURE } from "@repo/auth/entitlements";
import { useFeatureAccess } from "@repo/features/entitlements";
import { lazy } from "react";

const LazyAgentWorkPanel = lazy(() =>
  import("@repo/agent-work/panel").then((module) => ({
    default: module.AgentWorkPanel,
  }))
);

/** Gate every entry point, including restored panels and mobile routes. */
export function AgentWorkPanel() {
  const { allowed, pending } = useFeatureAccess(FEATURE.agentWork);
  if (pending || !allowed) {
    return null;
  }
  return <LazyAgentWorkPanel />;
}
