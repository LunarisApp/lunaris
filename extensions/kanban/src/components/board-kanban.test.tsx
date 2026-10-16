import { act, fireEvent, render, screen } from "@testing-library/react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  ReactNode,
} from "react";
import { describe, expect, it, vi } from "vitest";
import { KanbanView } from "./board-kanban";

interface MockKanbanItem {
  id: string;
}

const { kanbanState, propertyMaps } = vi.hoisted(() => {
  const makeMap = (values: Record<string, string>) => ({
    get(key: string) {
      return values[key];
    },
    set(key: string, value: string) {
      values[key] = value;
    },
  });

  return {
    kanbanState: {
      onValueChange: null as
        | null
        | ((value: Record<string, MockKanbanItem[]>) => void),
      onValueCommit: null as
        | null
        | ((
            value: Record<string, MockKanbanItem[]>,
            meta: {
              activeContainer: string;
              activeIndex: number;
              event: unknown;
              kind: "item" | "column";
              overContainer: string;
              overIndex: number;
              previousValue: Record<string, MockKanbanItem[]>;
            }
          ) => void),
      value: {} as Record<string, MockKanbanItem[]>,
    },
    propertyMaps: [
      makeMap({
        id: "status",
        name: "Status",
        options: JSON.stringify([
          { id: "todo", name: "Todo", color: "#f59e0b" },
          { id: "done", name: "Done", color: "#10b981" },
        ]),
        type: "select",
      }),
      makeMap({
        id: "priority",
        name: "Priority",
        options: JSON.stringify([
          { id: "high", name: "High", color: "#ef4444" },
        ]),
        type: "select",
      }),
    ],
  };
});

const assignments = new Map([
  [
    "item-1",
    new Map([
      ["prop_status", "todo"],
      ["prop_priority", "high"],
    ]),
  ],
  [
    "item-2",
    new Map([
      ["prop_status", "done"],
      ["prop_priority", ""],
    ]),
  ],
  [
    "item-3",
    new Map([
      ["prop_status", "todo"],
      ["prop_priority", ""],
    ]),
  ],
]);

const tasks = [
  {
    createdAt: "2026-04-01T12:00:00Z",
    documentId: "doc-1",
    id: "item-1",
    name: "Write docs",
    position: 0,
  },
  {
    documentId: "doc-3",
    id: "item-3",
    name: "Review launch",
    position: 1,
  },
  {
    documentId: "doc-2",
    id: "item-2",
    name: "Ship polish",
    position: 2,
  },
];

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) =>
      (
        ({
          "extensions.catalog.lunaris.kanban.addTaskToColumn": "Add item",
          "extensions.catalog.lunaris.kanban.created": "Created",
          "extensions.catalog.lunaris.kanban.collapseColumn": "Collapse",
          "extensions.catalog.lunaris.kanban.expandColumn": "Expand column",
          "extensions.catalog.lunaris.kanban.deleteTask": "Delete task",
          "extensions.catalog.lunaris.kanban.noPropertySelected":
            "No property selected",
          "extensions.catalog.lunaris.kanban.renameTask": "Rename task",
          "extensions.catalog.lunaris.kanban.taskActions": "Task actions",
          "extensions.catalog.lunaris.kanban.unassigned": "Unassigned",
          "extensions.catalog.lunaris.kanban.untitled": "Untitled",
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({
  useCurrentUser: () => ({ user: undefined }),
  useOrgMembersMap: () => ({ map: new Map() }),
}));

vi.mock("@lunarisapp/ui/blocks/responsive-dropdown-menu", () => ({
  ResponsiveDropdownMenu: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  ResponsiveDropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDropdownMenuItem: ({
    children,
    variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
  }) => (
    <button data-variant={variant} type="button" {...props}>
      {children}
    </button>
  ),
  ResponsiveDropdownMenuSeparator: () => <hr />,
  ResponsiveDropdownMenuTrigger: ({ render }: { render: ReactNode }) => render,
}));

vi.mock("@lunarisapp/ui/components/badge", () => ({
  Badge: ({
    children,
    className,
    title,
    style,
  }: {
    children: ReactNode;
    className?: string;
    title?: string;
    style?: CSSProperties;
  }) => (
    <span className={className} style={style} title={title}>
      {children}
    </span>
  ),
}));

vi.mock("@lunarisapp/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
    render,
  }: {
    children: ReactNode;
    render: ReactNode;
  }) => (
    <>
      {render}
      {children}
    </>
  ),
}));

vi.mock("@lunarisapp/ui/components/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@lunarisapp/ui/components/kanban", () => ({
  Kanban: ({
    children,
    onValueChange,
    onValueCommit,
    value,
  }: {
    children: ReactNode;
    onValueChange: NonNullable<typeof kanbanState.onValueChange>;
    onValueCommit: NonNullable<typeof kanbanState.onValueCommit>;
    value: Record<string, MockKanbanItem[]>;
  }) => {
    kanbanState.onValueChange = onValueChange;
    kanbanState.onValueCommit = onValueCommit;
    kanbanState.value = value;
    return <div>{children}</div>;
  },
  KanbanBoard: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  KanbanColumn: ({
    className,
    children,
    value,
  }: {
    className?: string;
    children: ReactNode;
    value: string;
  }) => (
    <section className={className} data-column={value}>
      {children}
    </section>
  ),
  KanbanColumnContent: ({
    children,
    value,
  }: {
    children: ReactNode;
    value: string;
  }) => <div data-column-content={value}>{children}</div>,
  KanbanColumnHandle: ({
    children,
    render,
    ...props
  }: {
    children?: ReactNode;
    render?: (props: HTMLAttributes<HTMLDivElement>) => ReactNode;
  } & HTMLAttributes<HTMLDivElement>) =>
    render ? (
      render(props)
    ) : (
      <div data-slot="kanban-column-handle" role="button" {...props}>
        {children}
      </div>
    ),
  KanbanItem: ({
    children,
    className,
    value,
  }: {
    children: ReactNode;
    className?: string;
    value: string;
  }) => (
    <article className={className} data-item={value}>
      {children}
    </article>
  ),
  KanbanItemHandle: ({
    children,
  }: {
    children?: ReactNode;
    render?: ReactNode;
  }) => <>{children}</>,
  KanbanOverlay: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

vi.mock("@lunarisapp/ui/icons", () => ({
  Add01Icon: {},
  Delete02Icon: {},
  Edit02Icon: {},
  HugeiconsIcon: () => <span aria-hidden="true" />,
  MoreVerticalIcon: {},
}));

vi.mock("../hooks", () => ({
  parseOptions: (map: { get: (key: string) => string | undefined }) =>
    JSON.parse(map.get("options") ?? "[]"),
  useYArray: () => ({ items: propertyMaps }),
}));

vi.mock("./task-created-at", () => ({
  TaskCreatedAt: ({
    createdAt,
    prefix,
  }: {
    createdAt?: string;
    prefix: string;
  }) =>
    createdAt ? (
      <span>
        {prefix} {createdAt}
      </span>
    ) : null,
}));

describe("KanbanView", () => {
  const moveResource = ({
    activeContainer,
    activeIndex,
    overContainer,
    overIndex,
  }: {
    activeContainer: string;
    activeIndex: number;
    event: unknown;
    overContainer: string;
    overIndex: number;
  }) => {
    if (activeContainer === overContainer && activeIndex === overIndex) {
      return;
    }

    const previousValue = kanbanState.value;
    const nextValue = Object.fromEntries(
      Object.entries(previousValue).map(([key, items]) => [key, [...items]])
    );
    const [item] = nextValue[activeContainer]!.splice(activeIndex, 1);
    if (!item) {
      throw new Error("Dragged item not found");
    }
    nextValue[overContainer]!.splice(overIndex, 0, item);

    expect(kanbanState.onValueChange).toBeTypeOf("function");
    expect(kanbanState.onValueCommit).toBeTypeOf("function");
    act(() => {
      kanbanState.onValueChange?.(nextValue);
      kanbanState.onValueCommit?.(nextValue, {
        activeContainer,
        activeIndex,
        event: {},
        kind: "item",
        overContainer,
        overIndex,
        previousValue,
      });
    });
  };

  it("renders one unassigned column when no Select grouping exists", () => {
    render(
      <KanbanView
        assignments={assignments as never}
        groupByPropertyId=""
        onAddTask={vi.fn()}
        onAssignmentChange={vi.fn()}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={vi.fn()}
        onSelectTask={vi.fn()}
        tasks={tasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );

    expect(Object.keys(kanbanState.value)).toEqual(["__unassigned"]);
    expect(kanbanState.value.__unassigned?.map(({ id }) => id)).toEqual([
      "item-1",
      "item-3",
      "item-2",
    ]);
  });

  it("hides grouped property badge and keeps other filled badges", () => {
    render(
      <KanbanView
        assignments={assignments as never}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={vi.fn()}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={vi.fn()}
        onSelectTask={vi.fn()}
        tasks={tasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );

    expect(screen.getByText("Write docs")).toBeTruthy();
    expect(screen.queryByTitle("Status: Todo")).toBeNull();
    expect(screen.getByTitle("Priority: High")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.getByText("Created 2026-04-01T12:00:00Z")).toBeTruthy();
    expect(screen.getAllByText(/Created /)).toHaveLength(1);
  });

  it("renders the live insertion target before a drag is committed", () => {
    const onAssignmentChange = vi.fn();
    render(
      <KanbanView
        assignments={assignments as never}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={onAssignmentChange}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={vi.fn()}
        onSelectTask={vi.fn()}
        tasks={tasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );

    const previousValue = kanbanState.value;
    const nextValue = {
      ...previousValue,
      done: [previousValue.todo![0]!, ...previousValue.done!],
      todo: previousValue.todo!.slice(1),
    };
    act(() => kanbanState.onValueChange?.(nextValue));

    expect(
      document.querySelector('[data-column="done"]')?.textContent
    ).toContain("Write docs");
    expect(
      screen.getByText("Write docs").closest("article")?.className
    ).toContain("data-[dragging=true]:border-dashed");
    expect(onAssignmentChange).not.toHaveBeenCalled();
  });

  it("collapses a column to a rail and restores it", () => {
    render(
      <KanbanView
        assignments={assignments as never}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={vi.fn()}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={vi.fn()}
        onSelectTask={vi.fn()}
        tasks={tasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Collapse" })[1]!);

    const todoColumn = document.querySelector('[data-column="todo"]');
    expect(todoColumn?.getAttribute("class")).toContain("w-12");
    expect(screen.queryByText("Write docs")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand column" }));
    expect(screen.getByText("Write docs")).toBeTruthy();
  });

  it("adds tasks from expanded and collapsed column headers without toggling", () => {
    const onAddTask = vi.fn();
    render(
      <KanbanView
        assignments={assignments as never}
        groupByPropertyId="status"
        onAddTask={onAddTask}
        onAssignmentChange={vi.fn()}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={vi.fn()}
        onSelectTask={vi.fn()}
        tasks={tasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );

    const column = document.querySelector('[data-column="todo"]')!;
    const headerAdd = column.querySelector('button[aria-label="Add item"]')!;
    fireEvent.click(headerAdd);
    expect(onAddTask).toHaveBeenLastCalledWith("todo");
    expect(screen.getByText("Write docs")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Collapse" })[1]!);
    fireEvent.click(column.querySelector('button[aria-label="Add item"]')!);
    expect(onAddTask).toHaveBeenCalledTimes(2);
    expect(onAddTask).toHaveBeenLastCalledWith("todo");
    expect(screen.getByRole("button", { name: "Expand column" })).toBeTruthy();
    expect(screen.queryByText("Write docs")).toBeNull();
  });

  it("does not collapse after dragging the header", () => {
    render(
      <KanbanView
        assignments={assignments as never}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={vi.fn()}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={vi.fn()}
        onSelectTask={vi.fn()}
        tasks={tasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );

    const header = screen.getAllByRole("button", { name: "Collapse" })[1]!;
    fireEvent.pointerDown(header, { clientX: 0, clientY: 0 });
    fireEvent.click(header, { clientX: 20, clientY: 0, detail: 1 });

    expect(screen.getByText("Write docs")).toBeTruthy();
  });

  it("offers task actions from a tap target without selecting the task", () => {
    const onDeleteTask = vi.fn();
    const onRenameTask = vi.fn();
    const onSelectTask = vi.fn();
    render(
      <KanbanView
        assignments={assignments as never}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={vi.fn()}
        onDeleteTask={onDeleteTask}
        onRenameTask={onRenameTask}
        onReorderTasks={vi.fn()}
        onSelectTask={onSelectTask}
        tasks={tasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Task actions" })[0]!
    );
    expect(onSelectTask).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Rename task" })[0]!);
    const deleteButton = screen.getAllByRole("button", {
      name: "Delete task",
    })[0]!;
    fireEvent.click(deleteButton);

    expect(onRenameTask).toHaveBeenCalledWith("item-1");
    expect(onDeleteTask).toHaveBeenCalledWith("item-1");
    expect(deleteButton.dataset.variant).toBe("destructive");

    fireEvent.click(screen.getByRole("button", { name: /Write docs/ }));
    expect(onSelectTask).toHaveBeenCalledWith("item-1");
  });

  it("hides mutation controls when access is read only", () => {
    render(
      <KanbanView
        assignments={assignments as never}
        canDelete={false}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={vi.fn()}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={vi.fn()}
        onSelectTask={vi.fn()}
        readOnly
        tasks={tasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );

    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rename task" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete task" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Task actions" })).toBeNull();
  });

  it("persists item reordering within a column", () => {
    const onAssignmentChange = vi.fn();
    const onReorderTasks = vi.fn();
    render(
      <KanbanView
        assignments={assignments as never}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={onAssignmentChange}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={onReorderTasks}
        onSelectTask={vi.fn()}
        tasks={tasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );

    moveResource({
      activeContainer: "todo",
      activeIndex: 1,
      event: {},
      overContainer: "todo",
      overIndex: 0,
    });

    expect(onAssignmentChange).not.toHaveBeenCalled();
    expect(onReorderTasks).toHaveBeenCalledWith(["item-3", "item-1", "item-2"]);
  });

  it("persists exact item placement when moving between columns", () => {
    const onAssignmentChange = vi.fn();
    const onReorderTasks = vi.fn();
    render(
      <KanbanView
        assignments={assignments as never}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={onAssignmentChange}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={onReorderTasks}
        onSelectTask={vi.fn()}
        tasks={tasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );

    moveResource({
      activeContainer: "todo",
      activeIndex: 0,
      event: {},
      overContainer: "done",
      overIndex: 1,
    });

    expect(onAssignmentChange).toHaveBeenCalledWith("item-1", "status", "done");
    expect(onReorderTasks).toHaveBeenCalledWith(["item-3", "item-2", "item-1"]);
  });

  it("keeps the drop preview stable while cross-column order persists", async () => {
    let resolveReorder = () => {};
    const onReorderTasks = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReorder = resolve;
        })
    );
    const renderView = (currentTasks = tasks) => (
      <KanbanView
        assignments={assignments as never}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={vi.fn()}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={onReorderTasks}
        onSelectTask={vi.fn()}
        tasks={currentTasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );
    const view = render(renderView());

    moveResource({
      activeContainer: "todo",
      activeIndex: 0,
      event: {},
      overContainer: "done",
      overIndex: 1,
    });

    assignments.get("item-1")?.set("prop_status", "done");
    view.rerender(renderView());
    expect(
      Array.from(
        document.querySelectorAll('[data-column-content="done"] [data-item]')
      ).map((item) => item.getAttribute("data-item"))
    ).toEqual(["item-2", "item-1"]);

    await act(async () => resolveReorder());
    expect(
      Array.from(
        document.querySelectorAll('[data-column-content="done"] [data-item]')
      ).map((item) => item.getAttribute("data-item"))
    ).toEqual(["item-2", "item-1"]);

    view.rerender(renderView([tasks[1]!, tasks[2]!, tasks[0]!]));
    expect(
      Array.from(
        document.querySelectorAll('[data-column-content="done"] [data-item]')
      ).map((item) => item.getAttribute("data-item"))
    ).toEqual(["item-2", "item-1"]);

    assignments.get("item-1")?.set("prop_status", "todo");
  });

  it("persists item placement in an empty unassigned column", () => {
    const onAssignmentChange = vi.fn();
    const onReorderTasks = vi.fn();
    render(
      <KanbanView
        assignments={assignments as never}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={onAssignmentChange}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={onReorderTasks}
        onSelectTask={vi.fn()}
        tasks={tasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );

    moveResource({
      activeContainer: "todo",
      activeIndex: 1,
      event: {},
      overContainer: "__unassigned",
      overIndex: 0,
    });

    expect(onAssignmentChange).toHaveBeenCalledWith("item-3", "status", null);
    expect(onReorderTasks).toHaveBeenCalledWith(["item-3", "item-1", "item-2"]);
  });

  it("does not persist a same-position drop", () => {
    const onAssignmentChange = vi.fn();
    const onReorderTasks = vi.fn();
    render(
      <KanbanView
        assignments={assignments as never}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={onAssignmentChange}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={onReorderTasks}
        onSelectTask={vi.fn()}
        tasks={tasks}
        yDoc={{ transact: vi.fn() } as never}
      />
    );

    moveResource({
      activeContainer: "todo",
      activeIndex: 0,
      event: {},
      overContainer: "todo",
      overIndex: 0,
    });

    expect(onAssignmentChange).not.toHaveBeenCalled();
    expect(onReorderTasks).not.toHaveBeenCalled();
  });
});
