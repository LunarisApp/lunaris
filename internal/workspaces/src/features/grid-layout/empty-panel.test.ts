import { describe, expect, it } from "vitest";
import {
  createEmptyPanelDefinition,
  EMPTY_PANEL_PLUGIN_ID,
  EMPTY_PANEL_RENDERER,
  findInitialEmptyPanelId,
  findSingleEmptyPanelId,
  INITIAL_EMPTY_PANEL_PARAM,
  isEmptyPanel,
} from "./empty-panel";
import type { Panel } from "./types";

function createStoredEmptyPanel(id: string, groupId: string): Panel {
  return {
    id,
    isUnloaded: false,
    lastActiveAt: 1,
    ...createEmptyPanelDefinition({ groupId, title: "New tab" }),
  };
}

describe("empty panel definitions", () => {
  it("creates a singleton panel by default", () => {
    expect(
      createEmptyPanelDefinition({ groupId: "main", title: "New tab" })
    ).toEqual({
      params: {},
      pluginId: EMPTY_PANEL_PLUGIN_ID,
      position: { direction: "within", referenceGroup: "main" },
      renderer: EMPTY_PANEL_RENDERER,
      title: "New tab",
    });
  });

  it("creates an explicitly repeatable panel", () => {
    expect(
      createEmptyPanelDefinition({
        allowDuplicate: true,
        groupId: "main",
        title: "New tab",
      }).allowDuplicate
    ).toBe(true);
  });

  it("marks only the startup launcher as initial", () => {
    const initial = createEmptyPanelDefinition({
      groupId: "main",
      initial: true,
      title: "New tab",
    });
    const initialPanel = {
      ...createStoredEmptyPanel("empty-initial", "main"),
      params: initial.params,
    };

    expect(initial.params?.[INITIAL_EMPTY_PANEL_PARAM]).toBe(true);
    expect(findInitialEmptyPanelId([initialPanel])).toBe("empty-initial");
    expect(
      findInitialEmptyPanelId([createStoredEmptyPanel("empty", "main")])
    ).toBeUndefined();
  });

  it("matches only the built-in empty panel renderer", () => {
    const panel = createStoredEmptyPanel("empty-1", "main");
    expect(isEmptyPanel(panel)).toBe(true);
    expect(isEmptyPanel({ ...panel, pluginId: "other" })).toBe(false);
    expect(isEmptyPanel({ ...panel, renderer: "other" })).toBe(false);
  });
});

describe("findSingleEmptyPanelId", () => {
  const mainEmptyPanel = createStoredEmptyPanel("empty-main", "main");
  const movedEmptyPanel = createStoredEmptyPanel("empty-moved", "left");

  it("uses stored placement before Dockview is ready", () => {
    expect(
      findSingleEmptyPanelId({
        groupId: "main",
        panels: [mainEmptyPanel, movedEmptyPanel],
      })
    ).toBe("empty-main");
  });

  it("ignores non-within stored placement", () => {
    expect(
      findSingleEmptyPanelId({
        groupId: "main",
        panels: [
          {
            ...mainEmptyPanel,
            position: { direction: "right", referenceGroup: "main" },
          },
        ],
      })
    ).toBeUndefined();
  });

  it("uses live membership after a panel moves groups", () => {
    expect(
      findSingleEmptyPanelId({
        groupId: "main",
        livePanelIds: [movedEmptyPanel.id],
        panels: [mainEmptyPanel, movedEmptyPanel],
      })
    ).toBe("empty-moved");
  });

  it("returns nothing when a group has multiple empty panels", () => {
    expect(
      findSingleEmptyPanelId({
        groupId: "main",
        livePanelIds: [mainEmptyPanel.id, movedEmptyPanel.id],
        panels: [mainEmptyPanel, movedEmptyPanel],
      })
    ).toBeUndefined();
  });

  it("treats an empty live membership as authoritative", () => {
    expect(
      findSingleEmptyPanelId({
        groupId: "main",
        livePanelIds: [],
        panels: [mainEmptyPanel],
      })
    ).toBeUndefined();
  });

  it("uses stored placement for a panel pending Dockview insertion", () => {
    expect(
      findSingleEmptyPanelId({
        allLivePanelIds: [],
        groupId: "main",
        livePanelIds: [],
        panels: [mainEmptyPanel],
      })
    ).toBe("empty-main");
  });

  it("preserves a panel rendered in another live group", () => {
    expect(
      findSingleEmptyPanelId({
        allLivePanelIds: [mainEmptyPanel.id],
        groupId: "left",
        livePanelIds: [],
        panels: [mainEmptyPanel],
      })
    ).toBeUndefined();
  });
});
