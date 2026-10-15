import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { CSSProperties, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Doc, Map as YMap } from "yjs";
import { UNASSIGNED_COLUMN_ID } from "../constants";
import type { PropertyDefinition } from "../types";
import { ListView } from "./board-list";

interface TestTask {
  id: string;
  name: string;
}

type TestColumns = Record<string, TestTask[]>;

const kanbanState = vi.hoisted(() => ({
  onValueChange: undefined as
    | ((value: Record<string, { id: string; name: string }[]>) => void)
    | undefined,
  onValueCommit: undefined as
    | ((
        value: Record<string, { id: string; name: string }[]>,
        meta: {
          activeContainer: string;
          activeIndex: number;
          kind: "item" | "column";
          overContainer: string;
          overIndex: number;
          previousValue: Record<string, { id: string; name: string }[]>;
        }
      ) => void)
    | undefined,
  value: {} as Record<string, { id: string; name: string }[]>,
}));

const properties: PropertyDefinition[] = [
  {
    id: "status",
    name: "Status",
    options: [
      { color: "#f59e0b", id: "todo", name: "Todo" },
      { color: "#10b981", id: "done", name: "Done" },
    ],
    type: "select",
  },
  {
    id: "priority",
    name: "Priority",
    options: [{ color: "#ef4444", id: "high", name: "High" }],
    type: "select",
  },
];

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; name?: string }) => {
      const translations: Record<string, string> = {
        "extensions.catalog.lunaris.kanban.fields.name": "Title",
        "extensions.catalog.lunaris.kanban.noTasks": "No items",
        "extensions.catalog.lunaris.kanban.unassigned": "Unassigned",
        "extensions.catalog.lunaris.kanban.untitled": "Untitled",
      };
      if (key === "extensions.catalog.lunaris.kanban.taskCount") {
        return `${options?.count} items`;
      }
      if (key === "extensions.catalog.lunaris.kanban.reorderTask") {
        return `Reorder ${options?.name}`;
      }
      if (key === "extensions.catalog.lunaris.kanban.collapseSection") {
        return `Collapse ${options?.name}`;
      }
      if (key === "extensions.catalog.lunaris.kanban.expandSection") {
        return `Expand ${options?.name}`;
      }
      if (key === "extensions.catalog.lunaris.kanban.addTaskToSection") {
        return `Add item to ${options?.name}`;
      }
      return translations[key] ?? key;
    },
  }),
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({
  useCurrentUser: () => ({ user: undefined }),
  useOrgMembersMap: () => ({ map: new Map() }),
}));

vi.mock("@lunarisapp/ui/components/kanban", () => ({
  Kanban: ({
    children,
    onValueChange,
    onValueCommit,
    value,
  }: {
    children: ReactNode;
    onValueChange: typeof kanbanState.onValueChange;
    onValueCommit: typeof kanbanState.onValueCommit;
    value: TestColumns;
  }) => {
    kanbanState.onValueChange = onValueChange;
    kanbanState.onValueCommit = onValueCommit;
    kanbanState.value = value;
    return <div>{children}</div>;
  },
  KanbanBoard: ({
    children,
    style,
  }: {
    children: ReactNode;
    style?: CSSProperties;
  }) => <div style={style}>{children}</div>,
  KanbanColumn: ({
    "aria-labelledby": ariaLabelledBy,
    children,
  }: {
    "aria-labelledby"?: string;
    children: ReactNode;
  }) => <section aria-labelledby={ariaLabelledBy}>{children}</section>,
  KanbanColumnContent: ({ children }: { children: ReactNode }) => (
    <ul>{children}</ul>
  ),
  KanbanItem: ({
    "aria-label": ariaLabel,
    children,
    disabled,
    value,
  }: {
    "aria-label"?: string;
    children: ReactNode;
    disabled?: boolean;
    value: string;
  }) => (
    <li aria-label={ariaLabel} data-disabled={disabled} data-value={value}>
      {children}
    </li>
  ),
  KanbanItemHandle: ({
    "aria-label": ariaLabel,
    children,
    style,
  }: {
    "aria-label"?: string;
    children: ReactNode;
    style?: CSSProperties;
  }) => (
    <button aria-label={ariaLabel} style={style} type="button">
      {children}
    </button>
  ),
  KanbanOverlay: () => null,
}));

vi.mock("../use-properties", () => ({
  useProperties: () => ({ properties, propertyMaps: [] }),
}));

vi.mock("./property-value-field", () => ({
  PropertyValueField: ({ property }: { property: PropertyDefinition }) => (
    <span>{`${property.name} value`}</span>
  ),
}));

const tasks = [
  { id: "task-1", name: "Write docs" },
  { id: "task-2", name: "Ship polish" },
  { id: "task-3", name: "Review launch" },
  { id: "task-4", name: "Check metrics" },
];

function renderList(readOnly = false, taskData = tasks) {
  const doc = new Doc();
  const assignments = doc.getMap<YMap<unknown>>("taskPropertyAssignments");
  for (const [taskId, status] of [
    ["task-1", "todo"],
    ["task-2", "done"],
    ["task-3", "removed-option"],
    ["task-4", "todo"],
  ] as const) {
    const assignment = new YMap<unknown>();
    assignment.set("prop_status", status);
    assignments.set(taskId, assignment);
  }
  const onSelectTask = vi.fn();
  const onAddTask = vi.fn();
  const onPropertyChange = vi.fn();
  const onReorderTasks = vi.fn(async () => undefined);

  const result = render(
    <ListView
      assignments={assignments}
      groupByPropertyId="status"
      onAddTask={onAddTask}
      onPropertyChange={onPropertyChange}
      onReorderTasks={onReorderTasks}
      onSelectTask={onSelectTask}
      readOnly={readOnly}
      tasks={taskData}
      yDoc={doc}
    />
  );

  return {
    ...result,
    doc,
    onAddTask,
    onPropertyChange,
    onReorderTasks,
    onSelectTask,
  };
}

describe("ListView", () => {
  it("renders a sectioned grid without table markup", () => {
    const { container, doc } = renderList();

    expect(screen.queryByText("Title")).toBeNull();
    expect(screen.getAllByText("Priority")).toHaveLength(1);
    expect(screen.queryByText("Status")).toBeNull();
    expect(screen.getAllByText("Priority value")).toHaveLength(4);
    expect(screen.queryByText("Status value")).toBeNull();

    const todoSection = screen.getByText("Todo").closest("section");
    const doneSection = screen.getByText("Done").closest("section");
    const unassignedSection = screen.getByText("Unassigned").closest("section");

    expect(todoSection?.textContent).toContain("Write docs");
    expect(todoSection?.textContent).toContain("Check metrics");
    expect(todoSection?.textContent).not.toContain("Ship polish");
    expect(todoSection?.getAttribute("aria-labelledby")).toBe(
      screen.getByText("Todo").id
    );
    expect(doneSection?.textContent).toContain("Ship polish");
    expect(unassignedSection?.textContent).toContain("Review launch");
    expect(container.querySelector("table")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Write docs" }).parentElement
        ?.parentElement?.style.gridTemplateColumns
    ).toContain("minmax(16rem, 1fr)");
    expect(
      screen.getByText("Todo").previousElementSibling?.getAttribute("style")
    ).toContain("#f59e0b");
    expect(
      screen.getByRole("button", { name: "Reorder Write docs" })
    ).toBeTruthy();

    doc.destroy();
  });

  it("opens a task from its title", () => {
    const { doc, onSelectTask } = renderList();

    fireEvent.click(screen.getByRole("button", { name: "Write docs" }));

    expect(onSelectTask).toHaveBeenCalledWith("task-1");
    doc.destroy();
  });

  it("collapses and expands a section", () => {
    const { doc } = renderList();
    const todoSection = screen.getByText("Todo").closest("section");
    expect(todoSection).not.toBeNull();
    const section = todoSection as HTMLElement;

    fireEvent.click(within(section).getByText("Todo"));

    expect(within(section).queryByText("Write docs")).toBeNull();
    expect(
      within(section)
        .getByRole("button", { name: "Expand Todo" })
        .getAttribute("aria-expanded")
    ).toBe("false");

    fireEvent.click(within(section).getByText("Todo"));

    expect(within(section).getByText("Write docs")).toBeTruthy();
    doc.destroy();
  });

  it("adds an item to a section without collapsing it", () => {
    const { doc, onAddTask } = renderList();
    const todoSection = screen.getByText("Todo").closest("section");
    expect(todoSection).not.toBeNull();
    const section = todoSection as HTMLElement;

    fireEvent.click(
      within(section).getByRole("button", { name: "Add item to Todo" })
    );

    expect(onAddTask).toHaveBeenCalledWith("todo");
    expect(within(section).getByText("Write docs")).toBeTruthy();
    doc.destroy();
  });

  it("offers section quick-add actions on an empty board", () => {
    const { doc, onAddTask } = renderList(false, []);

    fireEvent.click(
      screen.getByRole("button", { name: "Add item to Todo" })
    );

    expect(onAddTask).toHaveBeenCalledWith("todo");
    expect(screen.queryByText("No items")).toBeNull();
    doc.destroy();
  });

  it("moves a task between sections and persists the new order", () => {
    const { doc, onPropertyChange, onReorderTasks } = renderList();
    const previousValue = kanbanState.value;
    const value: TestColumns = {
      [UNASSIGNED_COLUMN_ID]: [tasks[2]!],
      todo: [tasks[3]!],
      done: [tasks[1]!, tasks[0]!],
    };

    act(() => {
      kanbanState.onValueCommit?.(value, {
        activeContainer: "todo",
        activeIndex: 0,
        kind: "item",
        overContainer: "done",
        overIndex: 1,
        previousValue,
      });
    });

    expect(onPropertyChange).toHaveBeenCalledWith(
      "task-1",
      "status",
      "done"
    );
    expect(onReorderTasks).toHaveBeenCalledWith([
      "task-3",
      "task-4",
      "task-2",
      "task-1",
    ]);
    doc.destroy();
  });

  it("reorders tasks within a section without changing the property", () => {
    const { doc, onPropertyChange, onReorderTasks } = renderList();
    const previousValue = kanbanState.value;
    const value: TestColumns = {
      [UNASSIGNED_COLUMN_ID]: [tasks[2]!],
      todo: [tasks[3]!, tasks[0]!],
      done: [tasks[1]!],
    };

    act(() => {
      kanbanState.onValueCommit?.(value, {
        activeContainer: "todo",
        activeIndex: 1,
        kind: "item",
        overContainer: "todo",
        overIndex: 0,
        previousValue,
      });
    });

    expect(onPropertyChange).not.toHaveBeenCalled();
    expect(onReorderTasks).toHaveBeenCalledWith([
      "task-3",
      "task-4",
      "task-1",
      "task-2",
    ]);
    doc.destroy();
  });

  it("clears the grouping property when moved to Unassigned", () => {
    const { doc, onPropertyChange } = renderList();

    act(() => {
      kanbanState.onValueCommit?.(
        {
          [UNASSIGNED_COLUMN_ID]: [tasks[2]!, tasks[1]!],
          todo: [tasks[0]!, tasks[3]!],
          done: [],
        },
        {
          activeContainer: "done",
          activeIndex: 0,
          kind: "item",
          overContainer: UNASSIGNED_COLUMN_ID,
          overIndex: 1,
          previousValue: kanbanState.value,
        }
      );
    });

    expect(onPropertyChange).toHaveBeenCalledWith("task-2", "status", null);
    doc.destroy();
  });

  it("disables drag mutations in read-only mode", () => {
    const { doc, onPropertyChange, onReorderTasks } = renderList(true);

    act(() => {
      kanbanState.onValueCommit?.(kanbanState.value, {
        activeContainer: "todo",
        activeIndex: 0,
        kind: "item",
        overContainer: "done",
        overIndex: 0,
        previousValue: kanbanState.value,
      });
    });

    expect(onPropertyChange).not.toHaveBeenCalled();
    expect(onReorderTasks).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Reorder Write docs")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add item to Todo" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Write docs" })
        .closest("li")
        ?.getAttribute("data-disabled")
    ).toBe("true");
    doc.destroy();
  });
});
