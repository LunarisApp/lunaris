import type { PanelWindowDescriptor } from "../grid-layout/panel-window-descriptor";
import type { AddPanel } from "../grid-layout/types";
import {
  AGENT_WORK_PANEL_ID,
  AGENT_WORK_RENDERER,
  AGENT_WORK_TOOL_ID,
} from "./constants";

const LEGACY_EXTENSION_ID = "lunaris.ai-chat";

export function isLegacyAgentWorkView(viewId: string) {
  return (
    viewId === LEGACY_EXTENSION_ID || viewId === `view:${LEGACY_EXTENSION_ID}`
  );
}

export function migrateAgentWorkPanel<T extends AddPanel>(panel: T): T {
  if (panel.pluginId !== LEGACY_EXTENSION_ID) {
    return panel;
  }
  return {
    ...panel,
    pluginId: AGENT_WORK_PANEL_ID,
    renderer: AGENT_WORK_RENDERER,
    title: "Agent Work",
    params: {
      ...panel.params,
      pluginId: AGENT_WORK_PANEL_ID,
      viewId: AGENT_WORK_TOOL_ID,
      toolId: AGENT_WORK_TOOL_ID,
    },
  };
}

export function migrateAgentWorkDescriptor(
  descriptor: PanelWindowDescriptor
): PanelWindowDescriptor {
  if (descriptor.extensionId !== LEGACY_EXTENSION_ID) {
    return descriptor;
  }
  const panel = migrateAgentWorkPanel({
    pluginId: descriptor.extensionId,
    renderer: descriptor.viewId,
    title: descriptor.title,
    params: descriptor.params,
  });
  return {
    extensionId: panel.pluginId,
    viewId: panel.renderer,
    title: panel.title,
    params: panel.params,
  };
}
