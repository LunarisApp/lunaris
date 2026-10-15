import { fireEvent, render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditorBreadcrumb } from "./breadcrumb";

const navigateToResource = vi.fn();
const openResource = vi.fn();
let breadcrumbItems: Array<{
  id: string;
  isLast: boolean;
  name: string;
  resourceTypeId: string | null;
  schemaVersion: number;
}> = [];
let resources: Array<{ icon: object; name: string; resourceTypeId: string }> = [];

vi.mock("@repo/workspaces/workspace-explorer", () => ({
  useResourceBreadcrumb: () => breadcrumbItems,
  useNavigateToResource: () => navigateToResource,
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({
  useResourceTypes: () => resources,
}));

vi.mock("../organization-navigation", () => ({
  useOrganizationNavigation: () => ({ openResource }),
}));

vi.mock("@lunarisapp/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  TooltipTrigger: ({ children, render }: { children: ReactNode; render: ReactNode }) => {
    const trigger = render as ReactElement<{ children?: ReactNode }>;
    return cloneElement(trigger, undefined, children);
  },
}));

vi.mock("@lunarisapp/ui/icons", () => ({
  HugeiconsIcon: () => <svg aria-hidden="true" data-testid="resource-type-icon" />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("EditorBreadcrumb", () => {
  it("uses the localized untitled label for blank content names", () => {
    breadcrumbItems = [
      {
        id: "board",
        isLast: false,
        name: "",
        resourceTypeId: "lunaris.kanban",
        schemaVersion: 1,
      },
      {
        id: "task",
        isLast: true,
        name: "Draft release",
        resourceTypeId: "lunaris.kanban.task",
        schemaVersion: 1,
      },
    ];
    resources = [
      { icon: {}, name: "Kanban Board", resourceTypeId: "lunaris.kanban" },
      {
        icon: {},
        name: "Kanban Task",
        resourceTypeId: "lunaris.kanban.task",
      },
    ];

    render(<EditorBreadcrumb resourceId="task" />);

    fireEvent.click(screen.getByRole("button", { name: "common.untitled" }));
    expect(openResource).toHaveBeenCalledWith({
      resourceId: "board",
      resourceTypeId: "lunaris.kanban",
        schemaVersion: 1,
      replaceCurrent: true,
      title: "common.untitled",
    });
  });

  it("shows current resource type icon and tooltip label", () => {
    breadcrumbItems = [
      {
        id: "folder",
        isLast: false,
        name: "Folder",
        resourceTypeId: null,
        schemaVersion: 1,
      },
      {
        id: "doc",
        isLast: true,
        name: "Doc",
        resourceTypeId: "lunaris.rich-text",
        schemaVersion: 1,
      },
    ];
    resources = [
      { icon: {}, name: "Rich Text", resourceTypeId: "lunaris.rich-text" },
    ];

    render(<EditorBreadcrumb resourceId="doc" />);

    expect(screen.getByTestId("resource-type-icon")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Rich Text" })).toBeTruthy();
    expect(screen.getByText("Rich Text")).toBeTruthy();
    expect(screen.getByText("Doc")).toBeTruthy();
  });

  it("keeps plain breadcrumb when resource type is missing", () => {
    breadcrumbItems = [
      {
        id: "doc",
        isLast: true,
        name: "Doc",
        resourceTypeId: "lunaris.missing",
        schemaVersion: 1,
      },
    ];
    resources = [];

    render(<EditorBreadcrumb resourceId="doc" />);

    expect(screen.queryByTestId("resource-type-icon")).toBeNull();
    expect(screen.getByText("Doc")).toBeTruthy();
  });

  it("appends a subview page after the navigable content item", () => {
    breadcrumbItems = [
      {
        id: "folder",
        isLast: false,
        name: "Folder",
        resourceTypeId: null,
        schemaVersion: 1,
      },
      {
        id: "board",
        isLast: true,
        name: "Roadmap",
        resourceTypeId: "lunaris.kanban",
        schemaVersion: 1,
      },
    ];
    resources = [
      { icon: {}, name: "Kanban", resourceTypeId: "lunaris.kanban" },
    ];
    const onNavigate = vi.fn();

    render(
      <EditorBreadcrumb
        currentPage="Draft release"
        resourceId="board"
        onNavigate={onNavigate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Roadmap" }));
    const icon = screen.getByTestId("resource-type-icon");
    expect(openResource).toHaveBeenCalledWith({
      resourceId: "board",
      resourceTypeId: "lunaris.kanban",
        schemaVersion: 1,
      replaceCurrent: true,
      title: "Roadmap",
    });
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(screen.getByText("Roadmap").closest("li")?.contains(icon)).toBe(true);
    expect(screen.getByText("Draft release").closest("li")?.contains(icon)).toBe(
      false
    );
    expect(screen.getByText("Draft release").getAttribute("aria-current")).toBe(
      "page"
    );
  });

  it("renders distinct icons for board and task crumbs", () => {
    breadcrumbItems = [
      {
        id: "board",
        isLast: false,
        name: "Roadmap",
        resourceTypeId: "lunaris.kanban",
        schemaVersion: 1,
      },
      {
        id: "task",
        isLast: true,
        name: "Draft release",
        resourceTypeId: "lunaris.kanban.task",
        schemaVersion: 1,
      },
    ];
    resources = [
      { icon: {}, name: "Kanban Board", resourceTypeId: "lunaris.kanban" },
      {
        icon: {},
        name: "Kanban Task",
        resourceTypeId: "lunaris.kanban.task",
      },
    ];

    render(<EditorBreadcrumb resourceId="task" />);

    expect(screen.getByRole("img", { name: "Kanban Board" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Kanban Task" })).toBeTruthy();
    expect(screen.getAllByTestId("resource-type-icon")).toHaveLength(2);
  });
});
