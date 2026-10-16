import { preparePluginActivation } from "@lunarisapp/plugin-sdk";
import { describe, expect, it, vi } from "vitest";

const { boardModuleLoaded, taskModuleLoaded } = vi.hoisted(() => ({
  boardModuleLoaded: vi.fn(),
  taskModuleLoaded: vi.fn(),
}));

vi.mock("./kanban-editor", () => {
  boardModuleLoaded();
  return {
    KanbanEditor: () => null,
    preloadKanbanEditor: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("./components/task-content", () => {
  taskModuleLoaded();
  return { TaskEditor: () => null };
});

import plugin, {
  KANBAN_PLUGIN_ID,
  KANBAN_TASK_RESOURCE_TYPE_ID,
} from "./index";

describe("Kanban plugin lazy views", () => {
  it("keeps editor code lazy during activation and preloads each view", async () => {
    const activation = await preparePluginActivation(plugin);
    const views = activation.contributions.filter(
      (contribution) => contribution.type === "view"
    );
    const boardView = views.find((view) => view.viewId === KANBAN_PLUGIN_ID);
    const taskView = views.find(
      (view) => view.viewId === KANBAN_TASK_RESOURCE_TYPE_ID
    );

    expect(boardModuleLoaded).not.toHaveBeenCalled();
    expect(taskModuleLoaded).not.toHaveBeenCalled();

    await boardView?.preload?.();
    expect(boardModuleLoaded).toHaveBeenCalledOnce();
    expect(taskModuleLoaded).not.toHaveBeenCalled();

    await taskView?.preload?.();
    expect(taskModuleLoaded).toHaveBeenCalledOnce();
  });
});
