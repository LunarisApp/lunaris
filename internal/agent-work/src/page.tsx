import { useLocation } from "react-router";
import type { ComponentType } from "react";
import { AgentWorkRoot } from "./root";

export default function AgentWorkPage(props: {
  AppBarLeading: ComponentType;
  AppBarTrailing: ComponentType;
}) {
  const { state } = useLocation();
  return (
    <AgentWorkRoot
      launchKey={state?.agentLaunch}
      variant="workbench"
      {...props}
    />
  );
}
