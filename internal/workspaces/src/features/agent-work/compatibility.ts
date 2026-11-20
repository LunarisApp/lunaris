import type { PanelWindowDescriptor } from "../grid-layout/panel-window-descriptor";
import type { AddPanel } from "../grid-layout/types";
import {
  AGENT_WORK_PANEL_ID,
  AGENT_WORK_RENDERER,
  AGENT_WORK_TOOL_ID,
} from "./constants";

const LEGACY_EXTENSION_ID = "lunaris.ai-chat";
const LEGACY_PANEL_TITLES = new Map([
  ["Agent Work", "Agent"],
  ["Agentenarbeit", "Agent"],
  ["Trabajo de agentes", "Agent"],
  ["Travail des agents", "Agent"],
  ["Trabalho de agentes", "Agent"],
  ["Agent Work Mini", "Agent Mini"],
]);

export function isLegacyAgentWorkView(viewId: string) {
  return (
    viewId === LEGACY_EXTENSION_ID || viewId === `view:${LEGACY_EXTENSION_ID}`
  );
}

export function migrateAgentWorkPanel<T extends AddPanel>(panel: T): T {
  if (
    panel.pluginId === AGENT_WORK_PANEL_ID &&
    panel.renderer === AGENT_WORK_RENDERER
  ) {
    const title = LEGACY_PANEL_TITLES.get(panel.title);
    return title ? { ...panel, title } : panel;
  }
  if (panel.pluginId !== LEGACY_EXTENSION_ID) {
    return panel;
  }
  return {
    ...panel,
    pluginId: AGENT_WORK_PANEL_ID,
    renderer: AGENT_WORK_RENDERER,
    title: "Agent",
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
  const savedPanel = {
    pluginId: descriptor.extensionId,
    renderer: descriptor.viewId,
    title: descriptor.title,
    params: descriptor.params,
  };
  const panel = migrateAgentWorkPanel(savedPanel);
  if (panel === savedPanel) {
    return descriptor;
  }
  return {
    extensionId: panel.pluginId,
    viewId: panel.renderer,
    title: panel.title,
    params: panel.params,
  };
}
