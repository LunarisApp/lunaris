import { describe, expect, it, vi } from "vitest";
import {
  findDuplicatePanelForAdd,
  findGroupById,
  findViewPanel,
  type GroupSizeSnapshot,
  rememberDockviewGroupSizes,
  resolveOpenPanelPosition,
  restoreAddedDockviewGroupSizes,
  restoreNonMainDockviewGroupSizes,
} from "./state-helpers";
import { type Group, MAIN_GROUP_ID, type Panel } from "./types";

describe("state-helpers", () => {
  const panels: Panel[] = [
    {
      id: "panel-1",
      isUnloaded: false,
      lastActiveAt: 1,
      pluginId: "plugin-a",
      renderer: "content",
      title: "Doc",
      params: { viewId: "item-1", resourceId: "item-1" },
    },
    {
      id: "panel-2",
      isUnloaded: false,
      lastActiveAt: 2,
      pluginId: "plugin-b",
      renderer: "tool",
      title: "Tool",
      params: {},
    },
  ];

  const groups: Group[] = [{ id: MAIN_GROUP_ID, direction: "right" }];

  it("dedupes routable panels by viewId", () => {
    expect(
      findDuplicatePanelForAdd(panels, {
        pluginId: "plugin-a",
        renderer: "content",
        title: "Another title",
        params: { viewId: "item-1", resourceId: "item-1" },
      })
    ).toBe(panels[0]);
  });

  it("dedupes singleton panels by plugin and renderer", () => {
    expect(
      findDuplicatePanelForAdd(panels, {
        pluginId: "plugin-b",
        renderer: "tool",
        title: "Another tool",
        params: {},
      })
    ).toBe(panels[1]);
  });

  it("allows explicitly repeatable chrome panels", () => {
    expect(
      findDuplicatePanelForAdd(panels, {
        allowDuplicate: true,
        pluginId: "plugin-b",
        renderer: "tool",
        title: "Repeatable tool",
        params: {},
      })
    ).toBeUndefined();
  });

  it("finds groups and view panels by id", () => {
    expect(findGroupById(groups, MAIN_GROUP_ID)).toBe(groups[0]);
    expect(findViewPanel(panels, "item-1")).toBe(panels[0]);
  });

  it("defaults to main group when no target is provided", () => {
    expect(resolveOpenPanelPosition(groups)).toEqual({
      position: { referenceGroup: MAIN_GROUP_ID },
      shouldEnsureMainGroup: false,
      withinGroupId: MAIN_GROUP_ID,
    });
  });

  it("requests main group bootstrap when missing", () => {
    expect(resolveOpenPanelPosition([])).toEqual({
      position: { referenceGroup: MAIN_GROUP_ID },
      shouldEnsureMainGroup: true,
      withinGroupId: MAIN_GROUP_ID,
    });
  });

  it("respects valid group and edge targets", () => {
    expect(
      resolveOpenPanelPosition(groups, {
        groupId: MAIN_GROUP_ID,
        direction: "below",
      })
    ).toEqual({
      position: { referenceGroup: MAIN_GROUP_ID, direction: "below" },
      shouldEnsureMainGroup: false,
    });

    expect(resolveOpenPanelPosition(groups, { direction: "left" })).toEqual({
      position: { direction: "left" },
      shouldEnsureMainGroup: false,
    });

    expect(
      resolveOpenPanelPosition(groups, { groupId: MAIN_GROUP_ID })
    ).toEqual({
      position: { direction: "within", referenceGroup: MAIN_GROUP_ID },
      shouldEnsureMainGroup: false,
      withinGroupId: MAIN_GROUP_ID,
    });
  });
});

describe("dockview group size helpers", () => {
  function createDockviewGroup(id: string, width: number, height: number) {
    return {
      id,
      width,
      height,
      api: { setSize: vi.fn() },
    };
  }

  it("restores non-main survivor sizes after a non-main group closes", () => {
    const snapshot = new Map<string, GroupSizeSnapshot>();
    const main = createDockviewGroup(MAIN_GROUP_ID, 600, 400);
    const left = createDockviewGroup("left", 220, 400);
    const right = createDockviewGroup("right", 280, 400);
    const custom = createDockviewGroup("custom", 360, 240);

    rememberDockviewGroupSizes(snapshot, [main, left, right, custom]);

    main.width = 880;
    right.width = 420;
    custom.width = 520;

    restoreNonMainDockviewGroupSizes({
      groups: [main, right, custom],
      removedGroupId: "left",
      snapshot,
    });

    expect(main.api.setSize).not.toHaveBeenCalled();
    expect(right.api.setSize).toHaveBeenCalledWith({
      width: 280,
      height: 400,
    });
    expect(custom.api.setSize).toHaveBeenCalledWith({
      width: 360,
      height: 240,
    });
  });

  it("does not restore sizes when main closes", () => {
    const snapshot = new Map<string, GroupSizeSnapshot>();
    const left = createDockviewGroup("left", 220, 400);
    const right = createDockviewGroup("right", 280, 400);

    rememberDockviewGroupSizes(snapshot, [left, right]);
    restoreNonMainDockviewGroupSizes({
      groups: [left, right],
      removedGroupId: MAIN_GROUP_ID,
      snapshot,
    });

    expect(left.api.setSize).not.toHaveBeenCalled();
    expect(right.api.setSize).not.toHaveBeenCalled();
  });

  it("does not restore sizes when main is missing", () => {
    const snapshot = new Map<string, GroupSizeSnapshot>();
    const left = createDockviewGroup("left", 220, 400);
    const right = createDockviewGroup("right", 280, 400);

    rememberDockviewGroupSizes(snapshot, [left, right]);
    restoreNonMainDockviewGroupSizes({
      groups: [right],
      removedGroupId: "left",
      snapshot,
    });

    expect(right.api.setSize).not.toHaveBeenCalled();
  });

  it("restores existing non-main sizes after a non-main group opens", () => {
    const snapshot = new Map<string, GroupSizeSnapshot>();
    const main = createDockviewGroup(MAIN_GROUP_ID, 600, 400);
    const left = createDockviewGroup("left", 220, 400);
    const custom = createDockviewGroup("custom", 360, 240);

    rememberDockviewGroupSizes(snapshot, [main, left, custom]);

    const right = createDockviewGroup("right", 320, 400);
    main.width = 380;
    left.width = 180;
    custom.width = 250;

    restoreAddedDockviewGroupSizes({
      groups: [main, left, custom, right],
      addedGroupId: "right",
      snapshot,
    });

    expect(main.api.setSize).not.toHaveBeenCalled();
    expect(right.api.setSize).not.toHaveBeenCalled();
    expect(left.api.setSize).toHaveBeenCalledWith({
      width: 220,
      height: 400,
    });
    expect(custom.api.setSize).toHaveBeenCalledWith({
      width: 360,
      height: 240,
    });
  });

  it("does not restore sizes when main opens", () => {
    const snapshot = new Map<string, GroupSizeSnapshot>();
    const main = createDockviewGroup(MAIN_GROUP_ID, 600, 400);
    const left = createDockviewGroup("left", 220, 400);

    rememberDockviewGroupSizes(snapshot, [left]);
    restoreAddedDockviewGroupSizes({
      groups: [main, left],
      addedGroupId: MAIN_GROUP_ID,
      snapshot,
    });

    expect(main.api.setSize).not.toHaveBeenCalled();
    expect(left.api.setSize).not.toHaveBeenCalled();
  });

  it("restores main size when a removed main group is recreated", () => {
    const snapshot = new Map<string, GroupSizeSnapshot>();
    const main = createDockviewGroup(MAIN_GROUP_ID, 800, 400);
    const left = createDockviewGroup("left", 200, 400);

    rememberDockviewGroupSizes(snapshot, [main, left]);
    main.width = 500;

    restoreAddedDockviewGroupSizes({
      groups: [main, left],
      addedGroupId: MAIN_GROUP_ID,
      snapshot,
    });

    expect(main.api.setSize).toHaveBeenCalledWith({
      width: 800,
      height: 400,
    });
    expect(left.api.setSize).not.toHaveBeenCalled();
  });

  it("does not restore sizes when a non-main opens without main", () => {
    const snapshot = new Map<string, GroupSizeSnapshot>();
    const left = createDockviewGroup("left", 220, 400);
    const right = createDockviewGroup("right", 280, 400);

    rememberDockviewGroupSizes(snapshot, [left]);
    restoreAddedDockviewGroupSizes({
      groups: [left, right],
      addedGroupId: "right",
      snapshot,
    });

    expect(left.api.setSize).not.toHaveBeenCalled();
    expect(right.api.setSize).not.toHaveBeenCalled();
  });
});
