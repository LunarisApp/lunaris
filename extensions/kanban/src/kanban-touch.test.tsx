import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Doc, Map as YMap } from "yjs";
import { KanbanView } from "./components/board-kanban";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) => key,
  }),
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({
  useCurrentUser: () => ({ user: undefined }),
  useOrgMembersMap: () => ({ map: new Map() }),
}));

vi.mock("./components/task-created-at", () => ({
  TaskCreatedAt: () => null,
}));

vi.mock("./use-properties", () => ({
  useProperties: () => ({
    properties: [
      {
        id: "status",
        name: "Status",
        options: [{ color: "#f59e0b", id: "todo", name: "Todo" }],
        type: "select",
      },
    ],
    propertyMaps: [],
  }),
}));

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  });
});

describe("Kanban touch controls", () => {
  it("starts dragging after holding the card", async () => {
    vi.useFakeTimers();

    const yDoc = new Doc();
    const property = new YMap<string>();
    property.set("id", "status");
    property.set("name", "Status");
    property.set("type", "select");
    property.set(
      "options",
      JSON.stringify([{ color: "#f59e0b", id: "todo", name: "Todo" }])
    );
    yDoc.getArray<YMap<string>>("properties").push([property]);

    const assignment = new YMap<unknown>();
    assignment.set("prop_status", "todo");
    const assignments = yDoc.getMap<YMap<unknown>>("taskAssignments");
    assignments.set("task-1", assignment);

    render(
      <KanbanView
        assignments={assignments}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={vi.fn()}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={vi.fn()}
        onSelectTask={vi.fn()}
        tasks={[{ id: "task-1", name: "Task 1" }]}
        yDoc={yDoc}
      />
    );

    const task = screen.getByText("Task 1").closest("button");
    if (!task) {
      throw new Error("Task button not found");
    }

    const actions = screen.getByRole("button", {
      name: "extensions.catalog.lunaris.kanban.taskActions",
    });
    fireEvent.touchStart(actions, {
      touches: [{ clientX: 10, clientY: 10, identifier: 1 }],
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(
      document
        .querySelector('[data-slot="kanban"]')
        ?.getAttribute("data-dragging")
    ).toBe("false");
    fireEvent.touchEnd(actions, { changedTouches: [] });

    fireEvent.touchStart(task, {
      touches: [{ clientX: 10, clientY: 10, identifier: 2 }],
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(
      document
        .querySelector('[data-slot="kanban"]')
        ?.getAttribute("data-dragging")
    ).toBe("true");

    expect(
      fireEvent.touchMove(document, {
        touches: [{ clientX: 20, clientY: 20, identifier: 2 }],
      })
    ).toBe(false);

    fireEvent.touchEnd(task, { changedTouches: [] });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });
  });

  it("opens task actions as a bottom drawer on mobile", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const yDoc = new Doc();
    const assignment = new YMap<unknown>();
    assignment.set("prop_status", "todo");
    const assignments = yDoc.getMap<YMap<unknown>>("taskAssignments");
    assignments.set("task-1", assignment);

    render(
      <KanbanView
        assignments={assignments}
        groupByPropertyId="status"
        onAddTask={vi.fn()}
        onAssignmentChange={vi.fn()}
        onDeleteTask={vi.fn()}
        onRenameTask={vi.fn()}
        onReorderTasks={vi.fn()}
        onSelectTask={vi.fn()}
        tasks={[{ id: "task-1", name: "Task 1" }]}
        yDoc={yDoc}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "extensions.catalog.lunaris.kanban.taskActions",
      })
    );

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="drawer-content"]')
      ).toBeTruthy();
    });
  });
});
