import { expect, it } from "vitest";
import {
  migrateAgentWorkDescriptor,
  migrateAgentWorkPanel,
  isLegacyAgentWorkView,
} from "./compatibility";
import { createGridLayoutStore } from "../grid-layout/store";

it("migrates legacy panels without losing identity, placement, or source context", () => {
  const panel = {
    id: "saved-panel",
    pluginId: "lunaris.ai-chat",
    renderer: "lunaris.ai-chat",
    title: "Assistant",
    params: { routeViewId: "res_notes" },
    position: { referenceGroup: "right-dock" },
  };
  const next = migrateAgentWorkPanel(panel);
  expect(next).toMatchObject({
    id: "saved-panel",
    pluginId: "system-agent-work",
    renderer: "agent-work",
    title: "Agent",
    params: {
      routeViewId: "res_notes",
      viewId: "agent-work",
      toolId: "agent-work",
    },
    position: panel.position,
  });
  expect(migrateAgentWorkPanel(next)).toEqual(next);
});

it("normalizes restored panels before deduplicating new tool opens", () => {
  const store = createGridLayoutStore();
  const restored = store.getState().addPanel({
    pluginId: "lunaris.ai-chat",
    renderer: "lunaris.ai-chat",
    title: "Assistant",
  });
  store.getState().openToolPanel({
    toolId: "agent-work",
    pluginId: "system-agent-work",
    renderer: "agent-work",
    title: "Agent",
  });
  expect(store.getState().panels).toHaveLength(1);
  expect(store.getState().panels[0].id).toBe(restored.id);
});

it("migrates saved window descriptors and recognizes old view URLs", () => {
  expect(
    migrateAgentWorkDescriptor({
      extensionId: "lunaris.ai-chat",
      viewId: "lunaris.ai-chat",
      title: "Assistant",
    })
  ).toMatchObject({
    extensionId: "system-agent-work",
    viewId: "agent-work",
    params: { toolId: "agent-work" },
  });
  expect(isLegacyAgentWorkView("view:lunaris.ai-chat")).toBe(true);
  expect(isLegacyAgentWorkView("lunaris.ai-chat")).toBe(true);
  expect(isLegacyAgentWorkView("view:another-extension")).toBe(false);
});

it.each([
  ["Agent Work", "Agent"],
  ["Agent Work Mini", "Agent Mini"],
  ["Agentenarbeit", "Agent"],
  ["Trabajo de agentes", "Agent"],
  ["Travail des agents", "Agent"],
  ["Trabalho de agentes", "Agent"],
])("updates the saved Agent title %s to %s", (oldTitle, title) => {
  const descriptor = {
    extensionId: "system-agent-work",
    params: { toolId: "agent-work", routeViewId: "res_notes" },
    title: oldTitle,
    viewId: "agent-work",
  };
  expect(migrateAgentWorkDescriptor(descriptor)).toEqual({
    ...descriptor,
    title,
  });
});

it("preserves unrelated extensions", () => {
  const panel = {
    pluginId: "lunaris.rich-text",
    renderer: "resource",
    title: "Notes",
  };
  expect(migrateAgentWorkPanel(panel)).toBe(panel);
});
