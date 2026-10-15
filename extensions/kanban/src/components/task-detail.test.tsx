import { fireEvent, render, screen } from "@testing-library/react";
import type {
  ButtonHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskDetail, resolveCreator } from "./task-detail";

const {
  currentUser,
  propertyMaps,
  setDescription,
} =
  vi.hoisted(() => {
  const makeMap = (values: Record<string, string>) => ({
    get: (key: string) => values[key],
  });
  return {
    currentUser: { value: undefined as
      | {
          email?: string | null;
          id?: string;
          image?: string | null;
          name?: string | null;
        }
      | undefined },
    propertyMaps: [
      makeMap({
        id: "status",
        name: "Status",
        options: JSON.stringify([
          { id: "todo", name: "Todo", color: "#f59e0b" },
        ]),
        type: "select",
      }),
    ],
    setDescription: vi.fn(),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "extensions.catalog.lunaris.kanban.fields.description": "Description",
          "extensions.catalog.lunaris.kanban.fields.name": "Title",
          "extensions.catalog.lunaris.kanban.placeholders.description":
            "Add description...",
          "extensions.catalog.lunaris.kanban.metadata.creator": "Created by",
          "extensions.catalog.lunaris.kanban.metadata.created": "Created",
          "extensions.catalog.lunaris.kanban.metadata.board": "Board",
          "extensions.catalog.lunaris.kanban.unknownCreator": "Unknown creator",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({
  useApiTransport: () => ({ baseUrl: "https://api.example.com/" }),
  useCurrentUser: () => ({ user: currentUser.value }),
  useOrgMembersMap: () => ({ map: new Map() }),
}));

vi.mock("@lunarisapp/ui/components/avatar", () => ({
  Avatar: ({ children }: { children: ReactNode }) => (
    <span data-testid="avatar">{children}</span>
  ),
  AvatarFallback: ({ children }: { children: ReactNode }) => <>{children}</>,
  AvatarImage: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

vi.mock("@lunarisapp/ui/hooks/use-gravatar-url", () => ({
  useGravatarUrl: (email?: string | null) =>
    email ? `https://gravatar.test/${encodeURIComponent(email)}` : undefined,
}));

vi.mock("@lunarisapp/ui/components/button", () => ({
  Button: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@lunarisapp/ui/components/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@lunarisapp/ui/components/textarea", () => ({
  Textarea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
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

vi.mock("@lunarisapp/ui/icons", () => ({
  ArrowExpandIcon: {},
  ArrowUpRight01Icon: {},
  Calendar03Icon: {},
  Cancel01Icon: {},
  Delete02Icon: {},
  HugeiconsIcon: () => <span aria-hidden="true" />,
  KanbanIcon: {},
  Tag01Icon: {},
  UserIcon: {},
}));

vi.mock("../hooks", () => ({
  parseOptions: (map: { get: (key: string) => string | undefined }) =>
    JSON.parse(map.get("options") ?? "[]"),
  useYArray: () => ({ items: propertyMaps }),
  useYMapField: (map: { get: (key: string) => string }, key: string) => [
    map.get(key) ?? "",
    setDescription,
  ],
}));

vi.mock("./task-created-at", () => ({
  TaskCreatedAt: ({ createdAt }: { createdAt?: string }) =>
    createdAt ? <div>{createdAt}</div> : null,
}));

const assignment = new Map([["prop_status", "todo"]]);
const taskMap = new Map([
  ["createdById", ""],
  ["description", ""],
]);
const task = {
  createdAt: "2026-04-01T12:00:00Z",
  name: "Existing task",
  parentId: "board-1",
  resourceTypeId: "lunaris.kanban.task",
  resourceId: "item-1",
  schemaVersion: 1,
  storage: { content: { kind: "yjs", storageId: "task-doc-1" } },
} satisfies import("@lunarisapp/plugin-sdk").PluginResource;

function renderDetail(
  overrides: Partial<React.ComponentProps<typeof TaskDetail>> = {}
) {
  const props: React.ComponentProps<typeof TaskDetail> = {
    assignment: assignment as never,
    boardDoc: {} as never,
    boardName: "Roadmap",
    onOpenBoard: vi.fn(),
    onPropertyChange: vi.fn(),
    onRename: vi.fn(),
    task,
    taskDoc: { getMap: () => taskMap } as never,
    ...overrides,
  };
  return { ...render(<TaskDetail {...props} />), props };
}

describe("TaskDetail", () => {
  beforeEach(() => {
    currentUser.value = undefined;
    taskMap.set("createdById", "");
  });

  it("renders fields, metadata, and colored property", () => {
    const { container } = renderDetail();

    expect(container.querySelector("h1 textarea#item-name")).toBeTruthy();
    expect((screen.getByLabelText("Title") as HTMLTextAreaElement).value).toBe(
      "Existing task"
    );
    expect(screen.getByLabelText("Description").getAttribute("placeholder")).toBe(
      "Add description..."
    );
    const statusField = screen.getByRole("button", { name: "Status" });
    expect(statusField.textContent).toContain("Todo");
    expect(statusField.className.split(/\s+/)).not.toContain("w-full");
    expect(
      screen.getByText("Status").parentElement?.querySelector("[aria-hidden=true]")
    ).toBeTruthy();
    for (const label of ["Created by", "Created", "Board"]) {
      expect(
        screen.getByText(label).parentElement?.querySelector("[aria-hidden=true]")
      ).toBeTruthy();
    }
    expect(screen.getByText("2026-04-01T12:00:00Z")).toBeTruthy();
    expect(screen.getByText("Roadmap")).toBeTruthy();
    expect(screen.getByText("Unknown creator")).toBeTruthy();
    expect(screen.getByText("Unknown creator").parentElement?.className).toContain(
      "px-1.5"
    );
    expect(screen.queryByRole("heading", { name: "Metadata" })).toBeNull();
    expect(
      screen
        .getByText("Status")
        .compareDocumentPosition(screen.getByText("Created by")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("opens the parent board from its metadata value", () => {
    const onOpenBoard = vi.fn();
    renderDetail({ onOpenBoard });

    fireEvent.click(screen.getByRole("button", { name: "Board: Roadmap" }));

    expect(onOpenBoard).toHaveBeenCalledWith("Roadmap");
  });

  it("reverts empty titles and renames with trimmed text", () => {
    const onRename = vi.fn();
    renderDetail({ onRename });
    const title = screen.getByLabelText("Title") as HTMLTextAreaElement;

    fireEvent.change(title, { target: { value: "   " } });
    fireEvent.blur(title);
    expect(title.value).toBe("Existing task");
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.change(title, { target: { value: "  Renamed task  " } });
    fireEvent.blur(title);
    expect(title.value).toBe("Renamed task");
    expect(onRename).toHaveBeenCalledWith("Renamed task");
  });

  it("resolves current, member, and unknown creators", () => {
    const currentUser = { id: "user-1", name: "Mina Park" };
    const member = { id: "user-2", email: "omar@example.com" };
    const members = new Map([["user-2", member]]);

    expect(
      resolveCreator("user-1", currentUser, members, "Unknown creator").label
    ).toBe("Mina Park");
    expect(
      resolveCreator("user-2", currentUser, members, "Unknown creator").label
    ).toBe("omar@example.com");
    expect(
      resolveCreator("missing", currentUser, members, "Unknown creator").label
    ).toBe("Unknown creator");
  });

  it("renders the creator's Gravatar when no uploaded avatar exists", () => {
    currentUser.value = {
      email: "mina@example.com",
      id: "user-1",
      name: "Mina Park",
    };
    taskMap.set("createdById", "user-1");

    renderDetail();

    expect(screen.getByAltText("Mina Park").getAttribute("src")).toBe(
      "https://gravatar.test/mina%40example.com"
    );
  });

  it("loads uploaded creator avatars through the account endpoint", () => {
    currentUser.value = {
      email: "mina@example.com",
      id: "user/1",
      image: "stored-avatar",
      name: "Mina Park",
    };
    taskMap.set("createdById", "user/1");

    renderDetail();

    expect(screen.getByAltText("Mina Park").getAttribute("src")).toBe(
      "https://api.example.com/v1/account/avatar/user%2F1"
    );
  });
});
