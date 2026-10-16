import { createBrowserPlatform, PlatformProvider } from "@repo/platform";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DockviewApi, IDockviewPanelProps } from "dockview";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GRID_LAYOUT_LOADED_PANEL_LIMIT,
  GridLayoutProvider,
  type GridLayoutState,
  useGridLayoutStore,
  useGridLayoutStoreState,
} from "./context";
import { createEmptyPanelDefinition } from "./empty-panel";
import { MAIN_GROUP_ID, RIGHT_GROUP_ID } from "./types";

vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
  },
}));

vi.mock("evlog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("evlog")>();
  return {
    ...actual,
    log: {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

function TestConsumer() {
  const state = useGridLayoutStoreState();
  const panels = useGridLayoutStore((s) => s.panels);
  const groups = useGridLayoutStore((s) => s.groups);

  return (
    <div>
      <span data-testid="panel-count">{panels.length}</span>
      <span data-testid="group-count">{groups.length}</span>
      <span data-testid="panels">{JSON.stringify(panels)}</span>
      <span data-testid="groups">{JSON.stringify(groups)}</span>
      <button
        data-testid="add-panel"
        onClick={() =>
          state.addPanel({
            pluginId: "test",
            renderer: "default",
            title: "Test Panel",
          })
        }
      >
        Add Panel
      </button>
      <button data-testid="add-group" onClick={() => state.addGroup({})}>
        Add Group
      </button>
      <button
        data-testid="remove-panel"
        onClick={() => {
          const panel = state.panels[0];
          if (panel) {
            state.removePanel(panel.id);
          }
        }}
      >
        Remove Panel
      </button>
      <button
        data-testid="remove-group"
        onClick={() => {
          const group = state.groups[0];
          if (group) {
            state.removeGroup(group.id);
          }
        }}
      >
        Remove Group
      </button>
      <button
        data-testid="register"
        onClick={() =>
          state.register("test-plugin", "custom", () => <div>Custom</div>)
        }
      >
        Register
      </button>
    </div>
  );
}

function StoreCapture({
  onStore,
}: {
  onStore: (state: GridLayoutState) => void;
}) {
  onStore(useGridLayoutStoreState());
  return null;
}

describe("GridLayoutProvider", () => {
  it("provides store to children", () => {
    render(
      <GridLayoutProvider>
        <TestConsumer />
      </GridLayoutProvider>
    );
    expect(screen.getByTestId("panel-count").textContent).toBe("0");
    expect(screen.getByTestId("group-count").textContent).toBe("0");
  });

  it("throws when useGridLayoutStore used outside provider", () => {
    expect(() => {
      render(<TestConsumer />);
    }).toThrow("useGridLayoutStore must be used within a GridLayoutProvider");
  });

  it("uses latest move-panel handler without recreating store", async () => {
    const firstHandler = vi.fn(async () => true);
    const secondHandler = vi.fn(async () => true);
    let store: GridLayoutState | undefined;
    const onStore = (state: GridLayoutState) => {
      store = state;
    };
    const view = render(
      <GridLayoutProvider onMovePanelToWindow={firstHandler}>
        <StoreCapture onStore={onStore} />
      </GridLayoutProvider>
    );

    act(() => {
      store?.addPanel({
        pluginId: "plugin",
        renderer: "content",
        title: "Document",
      });
    });
    const panelId = store?.panels[0]?.id;
    expect(panelId).toBeDefined();

    view.rerender(
      <GridLayoutProvider onMovePanelToWindow={secondHandler}>
        <StoreCapture onStore={onStore} />
      </GridLayoutProvider>
    );
    await act(async () => {
      await store?.movePanelToWindow(panelId!);
    });

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledOnce();
    expect(store?.panels).toHaveLength(0);
  });

  it("keeps move-panel action idle without a handler", async () => {
    let store: GridLayoutState | undefined;
    render(
      <GridLayoutProvider>
        <StoreCapture onStore={(state) => (store = state)} />
      </GridLayoutProvider>
    );

    act(() => {
      store?.addPanel({
        pluginId: "plugin",
        renderer: "content",
        title: "Document",
      });
    });
    const panelId = store?.panels[0]?.id;
    await act(async () => {
      await store?.movePanelToWindow(panelId!);
    });

    expect(store?.panels).toHaveLength(1);
    expect(store?.movingPanelIds).toEqual(new Set());
  });
});

describe("GridLayoutStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("addPanel() creates panel with generated id", async () => {
    const user = userEvent.setup();
    render(
      <GridLayoutProvider>
        <TestConsumer />
      </GridLayoutProvider>
    );
    await user.click(screen.getByTestId("add-panel"));
    expect(screen.getByTestId("panel-count").textContent).toBe("1");

    const panels = JSON.parse(screen.getByTestId("panels").textContent ?? "[]");
    expect(panels[0].id).toMatch(/^lp/);
    expect(panels[0].title).toBe("Test Panel");
    expect(panels[0].pluginId).toBe("test");
    expect(panels[0].renderer).toBe("default");
  });

  it("setDockviewApi() tracks initial active panel id", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });
    const mockApi = createMockDockviewApi({ id: "panel-active" });

    act(() => result.current.setDockviewApi(mockApi));

    expect(result.current.activePanelId).toBe("panel-active");
  });

  it("setDockviewApi(null) clears the disposed dockview instance", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });
    const mockApi = createMockDockviewApi({ id: "panel-active" });

    act(() => result.current.setDockviewApi(mockApi));
    act(() => result.current.setDockviewApi(null));

    expect(result.current.activePanelId).toBeNull();
    expect(result.current.dockviewApi).toBeNull();
  });

  it("markPanelActive() tracks active panel id", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.addPanel({
        pluginId: "plugin-a",
        renderer: "content",
        title: "Doc",
      });
    });
    const panel = result.current.panels[0];

    act(() => result.current.markPanelActive(panel!.id));

    expect(result.current.activePanelId).toBe(panel!.id);
  });

  it("removePanel() removes by id", async () => {
    const user = userEvent.setup();
    render(
      <GridLayoutProvider>
        <TestConsumer />
      </GridLayoutProvider>
    );
    await user.click(screen.getByTestId("add-panel"));
    expect(screen.getByTestId("panel-count").textContent).toBe("1");

    await user.click(screen.getByTestId("remove-panel"));
    expect(screen.getByTestId("panel-count").textContent).toBe("0");
  });

  it("addGroup() creates group with generated id", async () => {
    const user = userEvent.setup();
    render(
      <GridLayoutProvider>
        <TestConsumer />
      </GridLayoutProvider>
    );
    await user.click(screen.getByTestId("add-group"));
    expect(screen.getByTestId("group-count").textContent).toBe("1");

    const groups = JSON.parse(screen.getByTestId("groups").textContent ?? "[]");
    expect(groups[0].id).toMatch(/^lg/);
  });

  it("removeGroup() removes by id", async () => {
    const user = userEvent.setup();
    render(
      <GridLayoutProvider>
        <TestConsumer />
      </GridLayoutProvider>
    );
    await user.click(screen.getByTestId("add-group"));
    expect(screen.getByTestId("group-count").textContent).toBe("1");

    await user.click(screen.getByTestId("remove-group"));
    expect(screen.getByTestId("group-count").textContent).toBe("0");
  });

  it("keeps a group referenced by a pending panel", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });
    let groupsBeforeRemoval: GridLayoutState["groups"] = [];

    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID });
      result.current.addPanel({
        pluginId: "extension",
        position: { referenceGroup: MAIN_GROUP_ID },
        renderer: "resource",
        title: "Pending resource",
      });
      result.current.setDockviewApi(createMockDockviewApi());
      groupsBeforeRemoval = result.current.groups;
      result.current.removeGroup(MAIN_GROUP_ID);
    });

    expect(result.current.groups).toEqual([{ id: MAIN_GROUP_ID }]);
    expect(result.current.groups).not.toBe(groupsBeforeRemoval);
  });

  it("removes a group when its formerly referenced panel is live elsewhere", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID });
      const panel = result.current.addPanel({
        pluginId: "extension",
        position: { referenceGroup: MAIN_GROUP_ID },
        renderer: "resource",
        title: "Moved resource",
      });
      const api = createMockDockviewApi();
      vi.mocked(api.getPanel).mockReturnValue({
        group: { id: "other" },
        id: panel.id,
      } as never);
      result.current.setDockviewApi(api);
      result.current.removeGroup(MAIN_GROUP_ID);
    });

    expect(result.current.groups).toEqual([]);
  });

  it("register() stores component renderer", async () => {
    const user = userEvent.setup();
    let renderers: Record<string, unknown> = {};

    function RendererTestConsumer() {
      const state = useGridLayoutStoreState();
      renderers = state.componentRenderers;
      return (
        <button
          data-testid="register-btn"
          onClick={() =>
            state.register("my-plugin", "my-renderer", () => <div>Test</div>)
          }
        >
          Register
        </button>
      );
    }

    render(
      <GridLayoutProvider>
        <RendererTestConsumer />
      </GridLayoutProvider>
    );

    await user.click(screen.getByTestId("register-btn"));
    expect(renderers["my-plugin.my-renderer"]).toBeDefined();
  });

  it("register() hot-swaps an existing renderer slot", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.register("my-plugin", "my-renderer", () => (
        <div>First renderer</div>
      ));
    });
    const Renderer =
      result.current.componentRenderers["my-plugin.my-renderer"]!;
    render(<Renderer {...({} as IDockviewPanelProps)} />);

    act(() => {
      result.current.register("my-plugin", "my-renderer", () => (
        <div>Second renderer</div>
      ));
    });

    expect(result.current.componentRenderers["my-plugin.my-renderer"]).toBe(
      Renderer
    );
    expect(screen.queryByText("First renderer")).toBeNull();
    expect(screen.getByText("Second renderer")).toBeDefined();
  });

  it("resolves a deferred panel renderer without recreating its live component", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.register("resource-type", "resource", () => (
        <div>Loading extension</div>
      ));
      result.current.register("extension", "extension.view", () => (
        <div>Loaded extension</div>
      ));
      result.current.addPanel({
        params: {
          pluginId: "resource-type",
          resourceTypeId: "resource-type",
        },
        pluginId: "resource-type",
        renderer: "resource",
        title: "Resource",
      });
    });

    const panel = result.current.panels[0]!;
    const Renderer =
      result.current.componentRenderers["resource-type.resource"]!;
    render(<Renderer {...({} as IDockviewPanelProps)} />);
    expect(screen.getByText("Loading extension")).toBeDefined();

    act(() => {
      result.current.resolvePanelRenderer(
        panel.id,
        "extension",
        "extension.view"
      );
    });

    expect(screen.queryByText("Loading extension")).toBeNull();
    expect(screen.getByText("Loaded extension")).toBeDefined();
    expect(result.current.panels[0]).toMatchObject({
      params: { pluginId: "extension", resourceTypeId: "resource-type" },
      pluginId: "extension",
      renderer: "extension.view",
    });
  });

  it("addPanel() returns the created panel", async () => {
    let createdPanelId = "";

    function ReturnValueConsumer() {
      const state = useGridLayoutStoreState();
      return (
        <button
          data-testid="add-btn"
          onClick={() => {
            const panel = state.addPanel({
              pluginId: "test",
              renderer: "default",
              title: "Test",
            });
            createdPanelId = panel.id;
          }}
        >
          Add
        </button>
      );
    }

    const user = userEvent.setup();
    render(
      <GridLayoutProvider>
        <ReturnValueConsumer />
      </GridLayoutProvider>
    );

    await user.click(screen.getByTestId("add-btn"));
    expect(createdPanelId).toMatch(/^lp/);
  });

  it("adds a panel to ready Dockview synchronously exactly once", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });
    const api = createMockDockviewApi(null, [{ id: MAIN_GROUP_ID }]);

    act(() => {
      result.current.register("test", "default", () => null);
      result.current.setDockviewApi(api);
      result.current.addPanel({
        pluginId: "test",
        position: { referenceGroup: MAIN_GROUP_ID },
        renderer: "default",
        title: "Instant",
      });
    });

    expect(api.addPanel).toHaveBeenCalledOnce();
    expect(result.current.panels).toHaveLength(1);
  });

  it("leaves unavailable renderers for reconciliation", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });
    const api = createMockDockviewApi(null, [{ id: MAIN_GROUP_ID }]);

    act(() => {
      result.current.setDockviewApi(api);
      result.current.addPanel({
        pluginId: "test",
        position: { referenceGroup: MAIN_GROUP_ID },
        renderer: "missing",
        title: "Fallback",
      });
    });

    expect(api.addPanel).not.toHaveBeenCalled();
    expect(result.current.panels).toHaveLength(1);
  });

  it("defers immediate insertion until the reference group exists", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });
    const api = createMockDockviewApi();

    act(() => {
      result.current.register("test", "default", () => null);
      result.current.setDockviewApi(api);
      result.current.addPanel({
        pluginId: "test",
        position: { referenceGroup: MAIN_GROUP_ID },
        renderer: "default",
        title: "Await group",
      });
    });

    expect(api.addPanel).not.toHaveBeenCalled();
    expect(result.current.panels).toHaveLength(1);
  });

  it("keeps stored panel when immediate Dockview insertion throws", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });
    const api = createMockDockviewApi(null, [{ id: MAIN_GROUP_ID }]);
    vi.mocked(api.addPanel).mockImplementation(() => {
      throw new Error("Dockview not ready");
    });

    act(() => {
      result.current.register("test", "default", () => null);
      result.current.setDockviewApi(api);
      result.current.addPanel({
        pluginId: "test",
        position: { referenceGroup: MAIN_GROUP_ID },
        renderer: "default",
        title: "Reconcile later",
      });
    });

    expect(api.addPanel).toHaveBeenCalledOnce();
    expect(result.current.panels).toHaveLength(1);
  });

  it("addPanel() dedupes by viewId", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    let firstPanelId = "";
    let secondPanelId = "";

    act(() => {
      firstPanelId = result.current.addPanel({
        pluginId: "test",
        renderer: "default",
        title: "Test",
        params: { viewId: "item-1", resourceId: "item-1" },
      }).id;
      secondPanelId = result.current.addPanel({
        pluginId: "test",
        renderer: "default",
        title: "Test 2",
        params: { viewId: "item-1", resourceId: "item-1" },
      }).id;
    });

    expect(firstPanelId).toBe(secondPanelId);
    expect(result.current.panels).toHaveLength(1);
  });

  it("opens, dedupes, titles, and closes plugin panels by viewId", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID });
      result.current.addPanel({
        params: { viewId: "board-1" },
        pluginId: "lunaris.kanban",
        position: { referenceGroup: MAIN_GROUP_ID },
        renderer: "editor",
        title: "Roadmap",
      });
    });

    let opened = false;
    act(() => {
      opened = result.current.openPluginPanel({
        params: { documentId: "doc-1", taskId: "task-1" },
        pluginId: "lunaris.kanban",
        renderer: "task-detail",
        sourceViewId: "board-1",
        title: "Draft release notes",
        viewId: "kanban-task:doc-1:task-1",
      });
    });

    expect(opened).toBe(true);
    expect(result.current.panels).toHaveLength(2);
    expect(result.current.panels[1]).toMatchObject({
      params: {
        documentId: "doc-1",
        pluginId: "lunaris.kanban",
        taskId: "task-1",
        viewId: "kanban-task:doc-1:task-1",
      },
      position: { referenceGroup: MAIN_GROUP_ID },
      renderer: "task-detail",
    });

    act(() => {
      result.current.openPluginPanel({
        pluginId: "lunaris.kanban",
        renderer: "task-detail",
        title: "Renamed task",
        viewId: "kanban-task:doc-1:task-1",
      });
      result.current.updatePanelTitleByViewId(
        "kanban-task:doc-1:task-1",
        "Final title"
      );
    });

    expect(result.current.panels).toHaveLength(2);
    expect(result.current.panels[1]?.title).toBe("Final title");

    act(() => {
      result.current.removePanelsByViewIds(["kanban-task:doc-1:task-1"]);
    });
    expect(result.current.panels).toHaveLength(1);
  });

  it("opens secondary plugin panels in the right dock", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    let opened = false;
    act(() => {
      opened = result.current.openPluginPanel({
        placement: "secondary",
        pluginId: "example.chat",
        renderer: "example.chat",
        title: "AI Chat",
        viewId: "view:example.chat",
      });
    });

    expect(opened).toBe(true);
    expect(result.current.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: RIGHT_GROUP_ID, direction: "right" }),
      ])
    );
    expect(result.current.panels).toHaveLength(1);
    expect(result.current.panels[0]).toMatchObject({
      params: { routeViewId: null },
      pluginId: "example.chat",
      position: { referenceGroup: RIGHT_GROUP_ID },
      renderer: "example.chat",
      title: "AI Chat",
    });
    expect(result.current.panels[0]?.params?.viewId).toBeUndefined();
  });

  it("addPanel() keeps repeatable chrome panels distinct", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.addPanel({
        allowDuplicate: true,
        params: {},
        pluginId: "grid-layout",
        renderer: "empty-panel",
        title: "New tab",
      });
      result.current.addPanel({
        allowDuplicate: true,
        params: {},
        pluginId: "grid-layout",
        renderer: "empty-panel",
        title: "New tab",
      });
    });

    expect(result.current.panels).toHaveLength(2);
    expect(result.current.panels[0]?.id).not.toBe(result.current.panels[1]?.id);
    expect(result.current.panels.every((panel) => !panel.params?.viewId)).toBe(
      true
    );
  });

  it("requestRenameResource() targets an item without an active panel", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => result.current.requestRenameResource("item-new"));

    expect(result.current.renamingResourceId).toBe("item-new");
  });

  it("addGroup() dedupes by id", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID, direction: "right" });
      result.current.addGroup({ id: MAIN_GROUP_ID, direction: "left" });
    });

    expect(result.current.groups).toEqual([
      { id: MAIN_GROUP_ID, direction: "right" },
    ]);
  });

  it("getOrCreateRenderer() registers placeholder for known plugins", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    let renderer: unknown;

    act(() => {
      result.current.setKnownPluginIds(["known-plugin"]);
      renderer = result.current.getOrCreateRenderer("known-plugin", "content");
    });

    expect(renderer).toBeDefined();
    expect(result.current.componentRenderers["known-plugin.content"]).toBe(
      renderer
    );

    act(() => {
      result.current.register("known-plugin", "content", () => (
        <div>Loaded extension</div>
      ));
    });

    expect(result.current.componentRenderers["known-plugin.content"]).toBe(
      renderer
    );
  });

  it("unregister() keeps placeholder for known plugins and removes unknown ones", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.setKnownPluginIds(["known-plugin"]);
      result.current.register("known-plugin", "content", () => (
        <div>Known</div>
      ));
      result.current.register("unknown-plugin", "content", () => (
        <div>Unknown</div>
      ));
      result.current.unregister("known-plugin", "content");
      result.current.unregister("unknown-plugin", "content");
    });

    expect(
      result.current.componentRenderers["known-plugin.content"]
    ).toBeDefined();
    expect(
      result.current.componentRenderers["unknown-plugin.content"]
    ).toBeUndefined();
  });

  it("unregisterByPlugin() keeps known plugin slots present", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.setKnownPluginIds(["known-plugin"]);
      result.current.register("known-plugin", "one", () => <div>One</div>);
      result.current.register("known-plugin", "two", () => <div>Two</div>);
      result.current.unregisterByPlugin("known-plugin");
    });

    expect(result.current.componentRenderers["known-plugin.one"]).toBeDefined();
    expect(result.current.componentRenderers["known-plugin.two"]).toBeDefined();
  });

  it("openResourcePanel() creates main group and panel by default", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
    });

    expect(result.current.groups).toEqual([
      { id: MAIN_GROUP_ID, direction: "right" },
    ]);
    expect(result.current.panels).toHaveLength(1);
    expect(result.current.panels[0]?.position).toEqual({
      referenceGroup: MAIN_GROUP_ID,
    });
  });

  it("removes one empty panel when opening an item into its group", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID });
      result.current.addPanel(
        createEmptyPanelDefinition({
          groupId: MAIN_GROUP_ID,
          title: "New tab",
        })
      );
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
    });

    expect(result.current.panels).toHaveLength(1);
    expect(result.current.panels[0]?.params?.viewId).toBe("item-1");
  });

  it("removes a pending empty panel while Dockview main group is ready", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });
    const api = createMockDockviewApi(null, [
      { id: MAIN_GROUP_ID, panels: [] },
    ]);

    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID });
      result.current.addPanel(
        createEmptyPanelDefinition({
          groupId: MAIN_GROUP_ID,
          title: "New tab",
        })
      );
      result.current.setDockviewApi(api);
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
    });

    expect(result.current.panels).toHaveLength(1);
    expect(result.current.panels[0]?.params?.viewId).toBe("item-1");
  });

  it("preserves an empty panel rendered in another group", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });
    let emptyPanelId = "";

    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID });
      emptyPanelId = result.current.addPanel(
        createEmptyPanelDefinition({
          groupId: MAIN_GROUP_ID,
          title: "New tab",
        })
      ).id;
    });

    const liveEmptyPanel = { id: emptyPanelId };
    const api = createMockDockviewApi(null, [
      { id: MAIN_GROUP_ID, panels: [] },
      { id: "other", panels: [liveEmptyPanel] },
    ]);

    act(() => {
      result.current.setDockviewApi(api);
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
    });

    expect(result.current.panels).toHaveLength(2);
    expect(
      result.current.panels.some((panel) => panel.id === emptyPanelId)
    ).toBe(true);
  });

  it("removes the startup launcher after it moves groups", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });
    let emptyPanelId = "";

    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID });
      emptyPanelId = result.current.addPanel(
        createEmptyPanelDefinition({
          groupId: MAIN_GROUP_ID,
          initial: true,
          title: "New tab",
        })
      ).id;
    });

    const api = createMockDockviewApi(null, [
      { id: MAIN_GROUP_ID, panels: [] },
      { id: "other", panels: [{ id: emptyPanelId }] },
    ]);

    act(() => {
      result.current.setDockviewApi(api);
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
    });

    expect(result.current.panels).toHaveLength(1);
    expect(result.current.panels[0]?.params?.viewId).toBe("item-1");
  });

  it("removes the startup launcher when opening a plugin panel", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID });
      result.current.addPanel(
        createEmptyPanelDefinition({
          groupId: MAIN_GROUP_ID,
          initial: true,
          title: "New tab",
        })
      );
      result.current.openPluginPanel({
        pluginId: "lunaris.kanban",
        renderer: "task-detail",
        title: "Task",
        viewId: "kanban-task:doc-1:task-1",
      });
    });

    expect(result.current.panels).toHaveLength(1);
    expect(result.current.panels[0]?.params?.viewId).toBe(
      "kanban-task:doc-1:task-1"
    );
  });

  it("replaces a new tab when opening a plugin panel", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID });
      result.current.addPanel(
        createEmptyPanelDefinition({
          groupId: MAIN_GROUP_ID,
          title: "New tab",
        })
      );
      result.current.openPluginPanel({
        pluginId: "lunaris.kanban",
        renderer: "board",
        title: "Board",
        viewId: "kanban-board:doc-1",
      });
    });

    expect(result.current.panels).toHaveLength(1);
    expect(result.current.panels[0]?.params?.viewId).toBe("kanban-board:doc-1");
  });

  it("openResourcePanel() reuses existing resource panel when renderer matches", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
    });

    expect(result.current.panels).toHaveLength(1);
  });

  it("openResourcePanel() leaves an active loaded resource panel unchanged", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
    });

    const panelId = result.current.panels[0]?.id;
    expect(panelId).toBeDefined();
    if (!panelId) {
      return;
    }
    const setActive = vi.fn();
    const dockviewApi = {
      activePanel: { id: panelId },
      getPanel: vi.fn(() => ({ api: { setActive } })),
    } as unknown as DockviewApi;

    act(() => result.current.setDockviewApi(dockviewApi));
    const panelsBefore = result.current.panels;

    act(() => {
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
    });

    expect(setActive).not.toHaveBeenCalled();
    expect(result.current.panels).toBe(panelsBefore);
  });

  it("openResourcePanel() focuses an inactive loaded resource panel", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
    });

    const panelId = result.current.panels[0]?.id;
    expect(panelId).toBeDefined();
    if (!panelId) {
      return;
    }
    const setActive = vi.fn();
    const dockviewApi = {
      activePanel: { id: "other-panel" },
      getPanel: vi.fn((id: string) =>
        id === panelId ? { api: { setActive } } : undefined
      ),
    } as unknown as DockviewApi;

    act(() => result.current.setDockviewApi(dockviewApi));

    act(() => {
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
    });

    expect(setActive).toHaveBeenCalledOnce();
  });

  it("openToolPanel() reuses existing tool panel", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.openToolPanel({
        toolId: "tool-1",
        pluginId: "plugin-a",
        renderer: "tool",
        title: "Tool",
      });
      result.current.openToolPanel({
        toolId: "tool-1",
        pluginId: "plugin-a",
        renderer: "tool",
        title: "Tool",
      });
    });

    expect(result.current.panels).toHaveLength(1);
    expect(result.current.panels[0]?.position).toEqual({
      referenceGroup: MAIN_GROUP_ID,
    });
  });

  it("replaces the startup launcher when opening a tool", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID });
      result.current.addPanel(
        createEmptyPanelDefinition({
          groupId: MAIN_GROUP_ID,
          initial: true,
          title: "New tab",
        })
      );
      result.current.openToolPanel({
        toolId: "settings",
        pluginId: "system-workspace-settings",
        renderer: "panel",
        title: "Settings",
      });
    });

    expect(result.current.panels).toHaveLength(1);
    expect(result.current.panels[0]?.params?.viewId).toBe("settings");
  });

  it("replaces a new tab when opening a tool", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID });
      result.current.addPanel(
        createEmptyPanelDefinition({
          groupId: MAIN_GROUP_ID,
          title: "New tab",
        })
      );
      result.current.openToolPanel({
        toolId: "extensions",
        pluginId: "extensions",
        renderer: "panel",
        title: "Extensions",
      });
    });

    expect(result.current.panels).toHaveLength(1);
    expect(result.current.panels[0]?.params?.viewId).toBe("extensions");
  });

  it("opens Agent Work Mini on the right without replacing resource panels", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });
    act(() => {
      result.current.addGroup({ id: MAIN_GROUP_ID });
      result.current.addPanel({
        pluginId: "lunaris.rich-text",
        renderer: "content",
        title: "Notes",
        params: { viewId: "resource-notes", resourceId: "resource-notes" },
        position: { referenceGroup: MAIN_GROUP_ID },
      });
    });
    const resourcePanel = result.current.panels[0];
    act(() => {
      result.current.openToolPanel({
        toolId: "agent-work",
        pluginId: "system-agent-work",
        renderer: "agent-work",
        title: "Agent Work",
        target: { direction: "right" },
      });
    });
    expect(result.current.panels).toHaveLength(2);
    expect(result.current.panels[0]).toBe(resourcePanel);
    expect(result.current.panels[1]?.position).toEqual({ direction: "right" });
    act(() => {
      result.current.openToolPanel({
        toolId: "agent-work",
        pluginId: "system-agent-work",
        renderer: "agent-work",
        title: "Agent Work",
        target: { direction: "right" },
      });
    });
    expect(result.current.panels).toHaveLength(2);
    expect(result.current.panels[0]).toBe(resourcePanel);
  });

  it.each([true, false])(
    "preserves New tab for side-group openings (initial: %s)",
    (initial) => {
      const { result } = renderHook(() => useGridLayoutStoreState(), {
        wrapper: Wrapper,
      });
      act(() => {
        result.current.addGroup({ id: MAIN_GROUP_ID });
        result.current.addGroup({ id: RIGHT_GROUP_ID });
        result.current.addPanel(
          createEmptyPanelDefinition({
            groupId: MAIN_GROUP_ID,
            initial,
            title: "New tab",
          })
        );
      });
      const emptyId = result.current.panels[0]?.id;
      const resource = {
        resourceId: "side-resource",
        resourceTypeId: "rich-text",
        extensionId: "test",
        viewId: "content",
        schemaVersion: 1,
        title: "Side resource",
      };
      const tool = {
        toolId: "agent-work",
        pluginId: "system-agent-work",
        renderer: "agent-work",
        title: "Agent Work Mini",
      };
      const plugin = {
        pluginId: "test",
        renderer: "content",
        viewId: "side-plugin",
        title: "Side plugin",
        sourceViewId: "side-resource",
      };
      act(() => {
        result.current.openResourcePanel({
          ...resource,
          target: { groupId: RIGHT_GROUP_ID },
        });
        result.current.openToolPanel({
          ...tool,
          target: { direction: "right" },
        });
        result.current.openPluginPanel(plugin);
      });
      expect(result.current.panels.some((panel) => panel.id === emptyId)).toBe(
        true
      );
      act(() => {
        result.current.openResourcePanel(resource);
        result.current.openToolPanel(tool);
        result.current.openPluginPanel(plugin);
      });
      expect(result.current.panels.some((panel) => panel.id === emptyId)).toBe(
        true
      );
      act(() => {
        result.current.openToolPanel({
          ...tool,
          toolId: "side-tool",
          target: { groupId: RIGHT_GROUP_ID },
        });
      });
      expect(result.current.panels.some((panel) => panel.id === emptyId)).toBe(
        true
      );
      act(() => {
        result.current.openResourcePanel({
          ...resource,
          resourceId: "main-resource",
        });
      });
      expect(result.current.panels.some((panel) => panel.id === emptyId)).toBe(
        false
      );
    }
  );

  it("openToolPanel() places a new tool in the requested group", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.addGroup({ id: "group-custom" });
      result.current.openToolPanel({
        pluginId: "plugin-a",
        renderer: "tool",
        target: { direction: "within", groupId: "group-custom" },
        title: "Tool",
        toolId: "tool-1",
      });
    });

    expect(result.current.panels[0]?.position).toEqual({
      direction: "within",
      referenceGroup: "group-custom",
    });
  });

  it("unloads least-recently-used inactive panel after the loaded limit", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      for (let index = 0; index < GRID_LAYOUT_LOADED_PANEL_LIMIT + 1; index++) {
        result.current.addPanel({
          pluginId: "plugin-a",
          renderer: "content",
          title: `Panel ${index}`,
          params: { viewId: `panel-${index}` },
        });
      }
    });

    const unloadedPanels = result.current.panels.filter(
      (panel) => panel.isUnloaded
    );
    expect(unloadedPanels).toHaveLength(1);
    expect(unloadedPanels[0]?.params?.viewId).toBe("panel-0");
  });

  it("does not unload the active panel even when it is oldest", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      for (let index = 0; index < GRID_LAYOUT_LOADED_PANEL_LIMIT; index++) {
        result.current.addPanel({
          pluginId: "plugin-a",
          renderer: "content",
          title: `Panel ${index}`,
          params: { viewId: `panel-${index}` },
        });
      }
    });

    const oldestPanel = result.current.panels[0];
    expect(oldestPanel).toBeTruthy();

    act(() => {
      result.current.setDockviewApi(
        createMockDockviewApi({ id: oldestPanel?.id })
      );
      result.current.addPanel({
        pluginId: "plugin-a",
        renderer: "content",
        title: "Overflow",
        params: { viewId: "overflow" },
      });
    });

    const activePanel = result.current.panels.find(
      (panel) => panel.id === oldestPanel?.id
    );
    expect(activePanel?.isUnloaded).toBe(false);
    expect(
      result.current.panels.find((panel) => panel.params?.viewId === "panel-1")
        ?.isUnloaded
    ).toBe(true);
  });

  it("does not unload visible active panels across groups", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      for (let index = 0; index < GRID_LAYOUT_LOADED_PANEL_LIMIT; index++) {
        result.current.addPanel({
          pluginId: "plugin-a",
          renderer: "content",
          title: `Panel ${index}`,
          params: { viewId: `panel-${index}` },
        });
      }
    });

    const visibleOldestPanel = result.current.panels[0];
    const visibleNextOldestPanel = result.current.panels[1];
    expect(visibleOldestPanel).toBeTruthy();
    expect(visibleNextOldestPanel).toBeTruthy();

    act(() => {
      result.current.setDockviewApi(
        createMockDockviewApi(null, [
          { activePanel: { id: visibleOldestPanel?.id } },
          { activePanel: { id: visibleNextOldestPanel?.id } },
        ])
      );
      result.current.addPanel({
        pluginId: "plugin-a",
        renderer: "content",
        title: "Overflow",
        params: { viewId: "overflow" },
      });
    });

    expect(
      result.current.panels.find((panel) => panel.id === visibleOldestPanel?.id)
        ?.isUnloaded
    ).toBe(false);
    expect(
      result.current.panels.find(
        (panel) => panel.id === visibleNextOldestPanel?.id
      )?.isUnloaded
    ).toBe(false);
    expect(
      result.current.panels.find((panel) => panel.params?.viewId === "panel-2")
        ?.isUnloaded
    ).toBe(true);
  });

  it("markPanelActive() reloads an unloaded panel and updates LRU", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      for (let index = 0; index < GRID_LAYOUT_LOADED_PANEL_LIMIT + 1; index++) {
        result.current.addPanel({
          pluginId: "plugin-a",
          renderer: "content",
          title: `Panel ${index}`,
          params: { viewId: `panel-${index}` },
        });
      }
    });

    const unloadedPanel = result.current.panels.find(
      (panel) => panel.params?.viewId === "panel-0"
    );
    expect(unloadedPanel?.isUnloaded).toBe(true);

    act(() => {
      result.current.markPanelActive(unloadedPanel?.id ?? "");
    });

    const reloadedPanel = result.current.panels.find(
      (panel) => panel.id === unloadedPanel?.id
    );
    expect(reloadedPanel?.isUnloaded).toBe(false);
    expect(reloadedPanel?.lastActiveAt).toBeGreaterThan(
      unloadedPanel?.lastActiveAt ?? 0
    );
    expect(
      result.current.panels.filter((panel) => panel.isUnloaded)
    ).toHaveLength(1);
  });

  it("openResourcePanel() reloads an existing unloaded resource panel", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
      for (let index = 0; index < GRID_LAYOUT_LOADED_PANEL_LIMIT; index++) {
        result.current.addPanel({
          pluginId: "plugin-a",
          renderer: "content",
          title: `Panel ${index}`,
          params: { viewId: `panel-${index}` },
        });
      }
    });

    expect(
      result.current.panels.find((panel) => panel.params?.viewId === "item-1")
        ?.isUnloaded
    ).toBe(true);

    act(() => {
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
    });

    expect(
      result.current.panels.find((panel) => panel.params?.viewId === "item-1")
        ?.isUnloaded
    ).toBe(false);
  });

  it("openToolPanel() reloads an existing unloaded tool panel", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.openToolPanel({
        toolId: "tool-1",
        pluginId: "plugin-a",
        renderer: "tool",
        title: "Tool",
      });
      for (let index = 0; index < GRID_LAYOUT_LOADED_PANEL_LIMIT; index++) {
        result.current.addPanel({
          pluginId: "plugin-a",
          renderer: "content",
          title: `Panel ${index}`,
          params: { viewId: `panel-${index}` },
        });
      }
    });

    expect(
      result.current.panels.find((panel) => panel.params?.viewId === "tool-1")
        ?.isUnloaded
    ).toBe(true);

    act(() => {
      result.current.openToolPanel({
        toolId: "tool-1",
        pluginId: "plugin-a",
        renderer: "tool",
        title: "Tool",
      });
    });

    expect(
      result.current.panels.find((panel) => panel.params?.viewId === "tool-1")
        ?.isUnloaded
    ).toBe(false);
  });

  it("openRightDockPanel() creates right dock group and panel", () => {
    vi.useFakeTimers();
    const platform = createBrowserPlatform({ kind: "web" });
    platform.viewport.width = () => 2000;
    const ViewportWrapper = ({ children }: { children: ReactNode }) => (
      <PlatformProvider platform={platform}>
        <GridLayoutProvider>{children}</GridLayoutProvider>
      </PlatformProvider>
    );
    const sourcePanelApi = { setActive: vi.fn() };
    const dockviewPanel = {
      api: {
        setTitle: vi.fn(),
      },
      update: vi.fn(),
    };
    const getPanel = vi.fn<(id: string) => unknown>(() => dockviewPanel);
    const mockApi = {
      getPanel,
      onDidMaximizedGroupChange: vi.fn(() => ({ dispose: vi.fn() })),
    } as unknown as DockviewApi;
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: ViewportWrapper,
    });

    act(() => result.current.setDockviewApi(mockApi));
    act(() => {
      result.current.openResourcePanel({
        resourceId: "item-1",
        extensionId: "plugin-a",
        resourceTypeId: "plugin-a",
        viewId: "content",
        schemaVersion: 1,
        title: "Doc",
      });
    });

    const existingPanel = result.current.panels[0];
    expect(existingPanel).toBeTruthy();
    getPanel.mockImplementation((id: string) =>
      id === existingPanel?.id ? { api: sourcePanelApi } : dockviewPanel
    );

    act(() => {
      result.current.openRightDockPanel({
        extensionId: "plugin-a",
        sourceResourceId: "item-1",
        title: "History",
        params: { documentId: "yjs_1" },
        viewId: "history",
      });
      vi.runAllTimers();
    });

    expect(
      result.current.groups.some((group) => group.id === RIGHT_GROUP_ID)
    ).toBe(true);
    expect(
      result.current.groups.find((group) => group.id === RIGHT_GROUP_ID)
        ?.initialWidth
    ).toBe(560);
    expect(
      result.current.panels.some(
        (panel) =>
          panel.renderer === "history" &&
          (panel.position as { referenceGroup?: string } | undefined)
            ?.referenceGroup === RIGHT_GROUP_ID &&
          panel.params?.routeViewId === "item-1"
      )
    ).toBe(true);
    expect(sourcePanelApi.setActive).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// --- Focus mode tests ---

function createMockPanelApi() {
  return {
    close: vi.fn(),
    maximize: vi.fn(),
    exitMaximized: vi.fn(),
    isMaximized: vi.fn(() => false),
  };
}

function createMockDockviewApi(
  activePanel: unknown = null,
  groups: unknown[] = []
) {
  const panels = groups.flatMap(
    (group) => (group as { panels?: unknown[] }).panels ?? []
  );
  return {
    addPanel: vi.fn(),
    activePanel,
    getGroup: vi.fn((id: string) =>
      groups.find((group) => (group as { id?: string }).id === id)
    ),
    groups,
    panels,
    getPanel: vi.fn(() => undefined),
    onDidMaximizedGroupChange: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as DockviewApi;
}

function Wrapper({ children }: { children: ReactNode }) {
  return <GridLayoutProvider>{children}</GridLayoutProvider>;
}

describe("GridLayoutStore focus mode", () => {
  it("closeActivePanel is a no-op without dockviewApi", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => result.current.closeActivePanel());
    expect(result.current.dockviewApi).toBeNull();
  });

  it("closeActivePanel is a no-op without active panel", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    const mockApi = createMockDockviewApi(null);
    act(() => result.current.setDockviewApi(mockApi));
    act(() => result.current.closeActivePanel());
  });

  it("closeActivePanel closes active panel", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    const panelApi = createMockPanelApi();
    const mockApi = createMockDockviewApi({ api: panelApi });
    act(() => result.current.setDockviewApi(mockApi));
    act(() => result.current.closeActivePanel());

    expect(panelApi.close).toHaveBeenCalledOnce();
  });

  it("toggleFocusMode is a no-op without dockviewApi", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    act(() => result.current.toggleFocusMode());
    expect(result.current.isFocusMode).toBe(false);
  });

  it("toggleFocusMode is a no-op without active panel", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    const mockApi = createMockDockviewApi(null);
    act(() => result.current.setDockviewApi(mockApi));
    act(() => result.current.toggleFocusMode());
    expect(result.current.isFocusMode).toBe(false);
  });

  it("toggleFocusMode enters focus mode with active panel", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    const panelApi = createMockPanelApi();
    const mockApi = createMockDockviewApi({ api: panelApi });
    act(() => result.current.setDockviewApi(mockApi));
    act(() => result.current.toggleFocusMode());

    expect(result.current.isFocusMode).toBe(true);
    expect(panelApi.maximize).toHaveBeenCalledOnce();
  });

  it("toggleFocusMode exits focus mode when already focused", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    const panelApi = createMockPanelApi();
    const mockApi = createMockDockviewApi({ api: panelApi });
    act(() => result.current.setDockviewApi(mockApi));

    act(() => result.current.toggleFocusMode());
    expect(result.current.isFocusMode).toBe(true);

    act(() => result.current.toggleFocusMode());
    expect(result.current.isFocusMode).toBe(false);
    expect(panelApi.exitMaximized).toHaveBeenCalledOnce();
  });

  it("exitFocusMode is a no-op when not in focus mode", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    const panelApi = createMockPanelApi();
    const mockApi = createMockDockviewApi({ api: panelApi });
    act(() => result.current.setDockviewApi(mockApi));
    act(() => result.current.exitFocusMode());

    expect(result.current.isFocusMode).toBe(false);
    expect(panelApi.exitMaximized).not.toHaveBeenCalled();
  });

  it("exitFocusMode exits when in focus mode", () => {
    const { result } = renderHook(() => useGridLayoutStoreState(), {
      wrapper: Wrapper,
    });

    const panelApi = createMockPanelApi();
    const mockApi = createMockDockviewApi({ api: panelApi });
    act(() => result.current.setDockviewApi(mockApi));

    act(() => result.current.toggleFocusMode());
    expect(result.current.isFocusMode).toBe(true);

    act(() => result.current.exitFocusMode());
    expect(result.current.isFocusMode).toBe(false);
    expect(panelApi.exitMaximized).toHaveBeenCalledOnce();
  });
});
