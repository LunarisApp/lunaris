import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  preparePluginActivation,
  type PluginResourceActions,
  type ResourceViewDefinition,
} from "@lunarisapp/plugin-sdk";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Doc, Map as YMap } from "yjs";
import {
  KANBAN_PLUGIN_ID,
  KANBAN_TASK_RESOURCE_TYPE_ID,
  kanbanPlugin,
} from "./index";

const kanbanActivation = await preparePluginActivation(kanbanPlugin);

interface TestItem {
  createdAt?: string;
  name: string;
  parentId: string | null;
  position?: number;
  resourceId: string;
  resourceTypeId: string;
  schemaVersion: number;
  storage: { content: { kind: "yjs"; storageId: string } };
}

const testState = vi.hoisted(() => ({
  actions: {
    createResource: vi.fn<PluginResourceActions["createResource"]>(
      async () => ({
        name: "Prepare launch",
        resourceId: "task-created",
        storage: { content: { kind: "yjs", storageId: "task-doc-created" } },
      })
    ),
    deleteResource: vi.fn(async () => {}),
    renameResource: vi.fn(async () => {}),
    reorderResources: vi.fn(async () => {}),
    touchResource: vi.fn(async () => {}),
  },
  boardDoc: null as Doc | null,
  children: new Map<string, TestItem[]>(),
  items: new Map<string, TestItem>(),
  navigation: {
    openResource: vi.fn(),
    openResourceInNewWindow: vi.fn(async () => true),
  },
  taskDoc: null as Doc | null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@lunarisapp/plugin-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lunarisapp/plugin-sdk")>();
  const { lazy } = await import("react");
  return {
    ...actual,
    ViewReady: ({ children }: { children?: ReactNode }) => children,
    createPreloadableLazy: (
      loader: () => Promise<{ default: () => ReactNode }>
    ) => ({ Component: lazy(loader), preload: vi.fn(loader) }),
    defineResourceType: (input: object) => ({
      ...input,
      type: "resource-type",
    }),
    useCurrentUser: () => ({ isLoading: false, user: undefined }),
    useOrgMembersMap: () => ({ isLoading: false, map: new Map() }),
    useWorkspaceChildrenMap: () => testState.children,
    useWorkspaceResourceActions: () => testState.actions,
    useWorkspaceResourceName: () => "Roadmap",
    useWorkspaceResourcesMap: () => testState.items,
    useWorkspaceTrashMap: () => new Map(),
    useOrganizationNavigation: () => testState.navigation,
    useYjsStorage: (storage: { storageId: string }) => ({
      error: null,
      isLoading: false,
      yDoc:
        storage.storageId === "board-doc-1"
          ? testState.boardDoc
          : testState.taskDoc,
    }),
    useOrganizationAccess: () => ({
      canDeleteContent: true,
      canWriteContent: true,
    }),
  };
});

vi.mock("@lunarisapp/ui/components/panel-error", () => ({
  PanelError: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("./hooks", async () => {
  const actual = await vi.importActual<typeof import("./hooks")>("./hooks");
  return {
    ...actual,
    useCurrentWorkspaceYjsDocument: (documentId: string) => ({
      error: null,
      isLoading: false,
      yDoc:
        documentId === "board-doc-1" ? testState.boardDoc : testState.taskDoc,
    }),
    useTaskAssignments: (doc: Doc) =>
      doc.getMap<YMap<string>>("taskAssignments"),
    useYArray: (doc: Doc, name: string) => ({
      items: doc.getArray<YMap<string>>(name).toArray(),
    }),
  };
});

vi.mock("./components/property-manager", () => ({
  PropertyManager: () => <div>property-manager</div>,
}));

vi.mock("./components/board-list", () => ({
  ListView: ({
    groupByPropertyId,
    onAddTask,
  }: {
    groupByPropertyId: string;
    onAddTask: (groupId: string) => void;
  }) => (
    <div>
      {`list-group:${groupByPropertyId}`}
      <button onClick={() => onAddTask("todo")} type="button">
        Add list item to Todo
      </button>
    </div>
  ),
}));

vi.mock("./components/board-kanban", () => ({
  KanbanView: ({
    groupByPropertyId,
    onDeleteTask,
    onRenameTask,
    onSelectTask,
  }: {
    groupByPropertyId: string;
    onDeleteTask: (resourceId: string) => void;
    onRenameTask: (resourceId: string) => void;
    onSelectTask: (resourceId: string) => void;
  }) => (
    <div>
      kanban-ready
      <span>{`group:${groupByPropertyId}`}</span>
      <button onClick={() => onSelectTask("task-1")} type="button">
        Open task
      </button>
      <button onClick={() => onRenameTask("task-1")} type="button">
        Rename task menu
      </button>
      <button onClick={() => onDeleteTask("task-1")} type="button">
        Delete task menu
      </button>
    </div>
  ),
}));

vi.mock("./components/task-detail", () => ({
  TaskDetail: () => <div>detail-ready</div>,
}));

interface RegisteredResourceType {
  hierarchyVisibility?: "hidden" | "visible";
  initializeDocument?: (
    doc: Doc,
    context: {
      initialDocument?: { description?: string };
      userId: string | null;
    }
  ) => void;
  renderer: (props: {
    documentId?: string;
    resourceId?: string;
    params: Readonly<Record<string, string | undefined>>;
  }) => ReactNode;
  resourceTypeId: string;
  userCreatable?: boolean;
}

function getResourceTypes() {
  const views = kanbanActivation.contributions.filter(
    (contribution) => contribution.type === "view"
  );
  return kanbanActivation.contributions
    .filter((contribution) => contribution.type === "resource-type")
    .map((resource) => {
      const view = views.find(
        ({ viewId }) => viewId === resource.defaultViewId
      );
      return {
        hierarchyVisibility:
          resource.hierarchy?.visible === false ? "hidden" : "visible",
        resourceTypeId: resource.resourceTypeId,
        initializeDocument:
          resource.storage.content?.kind === "yjs" &&
          resource.storage.content.initialize
            ? (doc, context) =>
                resource.storage.content?.kind === "yjs"
                  ? resource.storage.content.initialize?.(doc, {
                      createdAt: "2026-01-01T00:00:00.000Z",
                      initialPayload: context.initialDocument,
                      parentId: null,
                      resourceId: "res-1",
                      userId: context.userId,
                    })
                  : undefined
            : undefined,
        renderer: ({ documentId, resourceId, params }) => {
          if (view?.target.kind !== "resource") {
            return null;
          }
          return (view as ResourceViewDefinition).renderer({
            params,
            resource: {
              parentId: null,
              resourceId: resourceId ?? "res-1",
              resourceTypeId: resource.resourceTypeId,
              schemaId: resource.schema.id,
              schemaVersion: resource.schema.currentVersion,
            },
            storage: documentId
              ? { content: { kind: "yjs", storageId: documentId } }
              : {},
          });
        },
        userCreatable: resource.hierarchy?.userCreatable !== false,
      } satisfies RegisteredResourceType;
    });
}

function getBoardContent() {
  const boardType = getResourceTypes().find(
    (resource) => resource.resourceTypeId === KANBAN_PLUGIN_ID
  );
  if (!boardType) {
    throw new Error("Board type not registered");
  }
  return boardType.renderer({
    documentId: "board-doc-1",
    resourceId: "board-1",
    params: {},
  });
}

function renderBoard() {
  return render(getBoardContent());
}

beforeEach(() => {
  vi.clearAllMocks();
  testState.boardDoc = new Doc();
  testState.taskDoc = new Doc();
  const property = new YMap<string>();
  property.set("id", "status");
  property.set("name", "Status");
  property.set("type", "select");
  property.set("options", "[]");
  testState.boardDoc.getArray<YMap<string>>("properties").push([property]);
  const board = {
    name: "Roadmap",
    parentId: null,
    resourceTypeId: KANBAN_PLUGIN_ID,
    resourceId: "board-1",
    schemaVersion: 1,
    storage: { content: { kind: "yjs" as const, storageId: "board-doc-1" } },
  };
  const task = {
    createdAt: "2026-04-01T12:00:00Z",
    name: "Draft release notes",
    parentId: "board-1",
    resourceTypeId: KANBAN_TASK_RESOURCE_TYPE_ID,
    resourceId: "task-1",
    schemaVersion: 1,
    position: 0,
    storage: { content: { kind: "yjs" as const, storageId: "task-doc-1" } },
  };
  testState.items = new Map<string, TestItem>([
    [board.resourceId, board],
    [task.resourceId, task],
  ]);
  testState.children = new Map([[board.resourceId, [task]]]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  testState.boardDoc?.destroy();
  testState.taskDoc?.destroy();
});

describe("Kanban resources", () => {
  it("registers a visible board and hidden non-creatable task type", () => {
    const resources = getResourceTypes();
    expect(resources.map((resource) => resource.resourceTypeId)).toEqual([
      KANBAN_PLUGIN_ID,
      KANBAN_TASK_RESOURCE_TYPE_ID,
    ]);
    expect(resources[1]).toMatchObject({
      hierarchyVisibility: "hidden",
      userCreatable: false,
    });
  });

  it("initializes task-owned description and creator data", () => {
    const taskType = getResourceTypes().find(
      (resource) => resource.resourceTypeId === KANBAN_TASK_RESOURCE_TYPE_ID
    );
    const doc = new Doc();
    taskType?.initializeDocument?.(doc, { userId: "user-7" });
    expect(doc.getMap<string>("task").toJSON()).toEqual({
      createdById: "user-7",
      description: "",
    });
    doc.destroy();

    const describedDoc = new Doc();
    taskType?.initializeDocument?.(describedDoc, {
      initialDocument: { description: "Coordinate the release" },
      userId: "user-7",
    });
    expect(describedDoc.getMap<string>("task").get("description")).toBe(
      "Coordinate the release"
    );
    describedDoc.destroy();
  });

  it("initializes fresh boards with Select Status", () => {
    const boardType = getResourceTypes().find(
      (resource) => resource.resourceTypeId === KANBAN_PLUGIN_ID
    );
    const doc = new Doc();
    boardType?.initializeDocument?.(doc, { userId: "user-7" });

    expect(
      doc.getArray<YMap<string>>("properties").get(0)?.toJSON()
    ).toMatchObject({ id: "status", type: "select" });
    expect(doc.getMap<unknown>("kanbanMeta").get("propertiesInitialized")).toBe(
      true
    );
    doc.destroy();
  });
});

describe("Kanban task flow", () => {
  it("does not write to an initialized board when opening or reopening it", async () => {
    const doc = testState.boardDoc!;
    doc.getMap("kanbanMeta").set("propertiesInitialized", true);
    const onUpdate = vi.fn();
    doc.on("update", onUpdate);

    renderBoard();
    await act(async () => vi.dynamicImportSettled());
    expect(await screen.findByText("group:status")).toBeTruthy();
    cleanup();

    renderBoard();
    await act(async () => vi.dynamicImportSettled());
    expect(await screen.findByText("group:status")).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(testState.actions.touchResource).not.toHaveBeenCalled();
  });

  it("keeps the selected grouping property in list view", async () => {
    renderBoard();
    await act(async () => vi.dynamicImportSettled());

    fireEvent.click(
      await screen.findByRole("button", {
        name: "extensions.catalog.lunaris.kanban.listView",
      })
    );

    expect(await screen.findByText("list-group:status")).toBeTruthy();
    expect(
      screen.getByRole("combobox", {
        name: "extensions.catalog.lunaris.kanban.groupBy",
      })
    ).toBeTruthy();
  });

  it("falls back to the first available grouping property", async () => {
    const properties = testState.boardDoc?.getArray<YMap<string>>("properties");
    properties?.delete(0, properties.length);
    const priority = new YMap<string>();
    priority.set("id", "priority");
    priority.set("name", "Priority");
    priority.set("type", "select");
    priority.set("options", "[]");
    properties?.push([priority]);

    renderBoard();

    expect(await screen.findByText("group:priority")).toBeTruthy();
  });

  it("does not group by non-Select properties", async () => {
    const properties = testState.boardDoc?.getArray<YMap<string>>("properties");
    properties?.delete(0, properties.length);
    const due = new YMap<string>();
    due.set("id", "due");
    due.set("name", "Due");
    due.set("type", "date");
    properties?.push([due]);

    renderBoard();

    expect(await screen.findByText("group:")).toBeTruthy();
    expect(
      screen.queryByRole("combobox", {
        name: "extensions.catalog.lunaris.kanban.groupBy",
      })
    ).toBeNull();
  });

  it("creates a hidden child through the workspace-resource API", async () => {
    const view = renderBoard();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /extensions\.catalog\.lunaris\.kanban\.addTask/,
      })
    );
    fireEvent.change(
      screen.getByPlaceholderText("extensions.catalog.lunaris.kanban.taskName"),
      { target: { value: "Prepare launch" } }
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "extensions.catalog.lunaris.kanban.placeholders.description"
      ),
      { target: { value: "Coordinate the release" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "common.create" }));

    await waitFor(() => {
      expect(testState.actions.createResource).toHaveBeenCalledWith({
        resourceTypeId: KANBAN_TASK_RESOURCE_TYPE_ID,
        initialPayload: { description: "Coordinate the release" },
        name: "Prepare launch",
        parentId: "board-1",
      });
      expect(
        screen.queryByPlaceholderText(
          "extensions.catalog.lunaris.kanban.taskName"
        )
      ).toBeNull();
    });

    expect(screen.queryByText("detail-ready")).toBeNull();

    const createdTask: TestItem = {
      createdAt: "2026-04-01T12:01:00Z",
      name: "Prepare launch",
      parentId: "board-1",
      resourceTypeId: KANBAN_TASK_RESOURCE_TYPE_ID,
      resourceId: "task-created",
      schemaVersion: 1,
      position: 1,
      storage: { content: { kind: "yjs", storageId: "task-doc-created" } },
    };
    testState.items.set(createdTask.resourceId, createdTask);
    testState.children.set("board-1", [
      ...(testState.children.get("board-1") ?? []),
      createdTask,
    ]);
    view.rerender(getBoardContent());

    expect(testState.navigation.openResource).not.toHaveBeenCalled();
    expect(screen.queryByText("detail-ready")).toBeNull();
  });

  it("creates a list item in the selected section", async () => {
    renderBoard();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "extensions.catalog.lunaris.kanban.listView",
      })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Add list item to Todo" })
    );
    fireEvent.change(
      screen.getByPlaceholderText("extensions.catalog.lunaris.kanban.taskName"),
      { target: { value: "Prepare launch" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "common.create" }));

    await waitFor(() => {
      expect(
        testState.boardDoc
          ?.getMap<YMap<unknown>>("taskAssignments")
          .get("task-created")
          ?.get("prop_status")
      ).toBe("todo");
    });
    expect(testState.navigation.openResource).not.toHaveBeenCalled();
  });

  it("creates a task with properties drafted in the dialog", async () => {
    const notes = new YMap<string>();
    notes.set("id", "notes");
    notes.set("name", "Notes");
    notes.set("type", "text");
    const blocked = new YMap<string>();
    blocked.set("id", "blocked");
    blocked.set("name", "Blocked");
    blocked.set("type", "checkbox");
    testState.boardDoc
      ?.getArray<YMap<string>>("properties")
      .push([notes, blocked]);

    renderBoard();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /extensions\.catalog\.lunaris\.kanban\.addTask/,
      })
    );
    fireEvent.change(
      screen.getByPlaceholderText("extensions.catalog.lunaris.kanban.taskName"),
      { target: { value: "Prepare launch" } }
    );
    const notesInput = screen.getByRole("textbox", { name: "Notes" });
    fireEvent.change(notesInput, { target: { value: "Coordinate release" } });
    fireEvent.blur(notesInput);
    fireEvent.click(screen.getByRole("checkbox", { name: "Blocked" }));
    fireEvent.click(screen.getByRole("button", { name: "common.create" }));

    await waitFor(() => {
      expect(
        testState.boardDoc
          ?.getMap<YMap<unknown>>("taskAssignments")
          .get("task-created")
          ?.get("prop_notes")
      ).toBe("Coordinate release");
      expect(
        testState.boardDoc
          ?.getMap<YMap<unknown>>("taskAssignments")
          .get("task-created")
          ?.get("prop_blocked")
      ).toBe(true);
    });
    expect(testState.actions.touchResource).toHaveBeenCalledWith(
      "task-created"
    );
  });

  it.each(["a rejected request", "an empty result"])(
    "keeps the create dialog open after %s",
    async (failure) => {
      if (failure === "a rejected request") {
        testState.actions.createResource.mockRejectedValueOnce(
          new Error("create failed")
        );
      } else {
        testState.actions.createResource.mockResolvedValueOnce(null);
      }
      renderBoard();
      fireEvent.click(
        await screen.findByRole("button", {
          name: /extensions\.catalog\.lunaris\.kanban\.addTask/,
        })
      );
      fireEvent.change(
        screen.getByPlaceholderText(
          "extensions.catalog.lunaris.kanban.taskName"
        ),
        { target: { value: "Prepare launch" } }
      );
      fireEvent.click(screen.getByRole("button", { name: "common.create" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(
        "extensions.catalog.lunaris.kanban.createError"
      );
      const title = screen.getByPlaceholderText(
        "extensions.catalog.lunaris.kanban.taskName"
      );
      expect(title.getAttribute("aria-invalid")).toBeNull();
      expect(title.getAttribute("aria-describedby")).toBe(alert.id);
    }
  );

  it("explains organization resource-capacity failures", async () => {
    const error = new Error("Organization resource limit reached");
    error.name = "ResourceCapacityExceededError";
    testState.actions.createResource.mockRejectedValueOnce(error);
    renderBoard();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /extensions\.catalog\.lunaris\.kanban\.addTask/,
      })
    );
    fireEvent.change(
      screen.getByPlaceholderText("extensions.catalog.lunaris.kanban.taskName"),
      { target: { value: "Prepare launch" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "common.create" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "errors.reason.entitlements.resourceLimit.desc"
    );
  });

  it("opens a task directly in an organization panel", async () => {
    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: "Open task" }));

    expect(testState.navigation.openResource).toHaveBeenCalledWith({
      resourceId: "task-1",
      resourceTypeId: KANBAN_TASK_RESOURCE_TYPE_ID,
      schemaVersion: 1,
      title: "Draft release notes",
    });
    expect(screen.queryByText("detail-ready")).toBeNull();
  });

  it("renames and trashes through workspace-resource actions", async () => {
    const assignment = new YMap<string>();
    assignment.set("prop_status", "in-progress");
    testState.boardDoc
      ?.getMap<YMap<string>>("taskAssignments")
      .set("task-1", assignment);
    renderBoard();
    fireEvent.click(
      await screen.findByRole("button", { name: "Rename task menu" })
    );
    fireEvent.change(screen.getByDisplayValue("Draft release notes"), {
      target: { value: "  New title  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    expect(testState.actions.renameResource).toHaveBeenCalledWith(
      "task-1",
      "New title"
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete task menu" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "extensions.catalog.lunaris.kanban.deleteTask",
      })
    );
    await waitFor(() => {
      expect(testState.actions.deleteResource).toHaveBeenCalledWith("task-1");
      expect(
        testState.boardDoc
          ?.getMap<YMap<string>>("taskAssignments")
          .has("task-1")
      ).toBe(true);
    });
  });

  it("preserves assignment when task deletion fails", async () => {
    const assignment = new YMap<string>();
    assignment.set("prop_status", "in-progress");
    testState.boardDoc
      ?.getMap<YMap<string>>("taskAssignments")
      .set("task-1", assignment);
    testState.actions.deleteResource.mockRejectedValueOnce(
      new Error("delete failed")
    );
    renderBoard();

    fireEvent.click(
      await screen.findByRole("button", { name: "Delete task menu" })
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "extensions.catalog.lunaris.kanban.deleteTask",
      })
    );

    await waitFor(() => {
      expect(testState.actions.deleteResource).toHaveBeenCalledWith("task-1");
      expect(
        testState.boardDoc
          ?.getMap<YMap<string>>("taskAssignments")
          .has("task-1")
      ).toBe(true);
    });
  });

  it("cleans assignment only after task stays missing for grace period", async () => {
    const view = renderBoard();
    await screen.findByText("kanban-ready");
    vi.useFakeTimers();

    const assignment = new YMap<string>();
    assignment.set("prop_status", "in-progress");
    testState.boardDoc
      ?.getMap<YMap<string>>("taskAssignments")
      .set("task-1", assignment);
    testState.items = new Map(
      Array.from(testState.items).filter(
        ([resourceId]) => resourceId !== "task-1"
      )
    );
    testState.children = new Map([["board-1", []]]);
    view.rerender(getBoardContent());

    act(() => vi.advanceTimersByTime(29_999));
    expect(
      testState.boardDoc?.getMap<YMap<string>>("taskAssignments").has("task-1")
    ).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(
      testState.boardDoc?.getMap<YMap<string>>("taskAssignments").has("task-1")
    ).toBe(false);
  });

  it("cancels assignment cleanup when missing task arrives", async () => {
    const task = testState.items.get("task-1");
    if (!task) {
      throw new Error("Task fixture missing");
    }
    const view = renderBoard();
    await screen.findByText("kanban-ready");
    vi.useFakeTimers();

    const assignment = new YMap<string>();
    assignment.set("prop_status", "in-progress");
    testState.boardDoc
      ?.getMap<YMap<string>>("taskAssignments")
      .set("task-1", assignment);
    testState.items = new Map(
      Array.from(testState.items).filter(
        ([resourceId]) => resourceId !== "task-1"
      )
    );
    testState.children = new Map([["board-1", []]]);
    view.rerender(getBoardContent());

    act(() => vi.advanceTimersByTime(20_000));
    testState.items = new Map([...testState.items, [task.resourceId, task]]);
    testState.children = new Map([["board-1", [task]]]);
    view.rerender(getBoardContent());
    act(() => vi.advanceTimersByTime(30_000));

    expect(
      testState.boardDoc?.getMap<YMap<string>>("taskAssignments").has("task-1")
    ).toBe(true);
  });
});
