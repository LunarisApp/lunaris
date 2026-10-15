import type { ComponentType } from "react";
import { AgentWorkRoot } from "./root";

export default function AgentWorkPage(props: { AppBarLeading: ComponentType; AppBarTrailing: ComponentType }) {
  return <AgentWorkRoot variant="workbench" {...props} />;
}
