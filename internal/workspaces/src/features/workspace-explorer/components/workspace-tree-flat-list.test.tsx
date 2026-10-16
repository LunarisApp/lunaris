import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const openResource = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@lunarisapp/ui/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("../../organization-navigation", () => ({
  useOrganizationNavigation: () => ({ openResource }),
}));

vi.mock("../../extensions", () => ({
  useExtensionRegistry: () => ({
    enabledExtensionIds: [],
    extensionAvailability: {},
  }),
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({
  useResourceTypes: () => [],
}));

vi.mock("../store", () => ({
  useWorkspaceResourcesMap: () => new Map(),
}));

vi.mock("../utils", () => ({
  getAncestorPath: () => [],
}));

// Virtualizer relies on DOM layout; in happy-dom clientHeight is 0 so nothing
// renders. Stub to expose every item synchronously for assertions.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number; estimateSize: () => number }) => {
    const size = options.estimateSize();
    const items = Array.from({ length: options.count }, (_, index) => ({
      index,
      key: index,
      start: index * size,
      end: (index + 1) * size,
      size,
      lane: 0,
    }));
    return {
      getTotalSize: () => options.count * size,
      getVirtualItems: () => items,
      scrollToIndex: vi.fn(),
      measure: vi.fn(),
    };
  },
}));

import { WorkspaceTreeFlatList } from "./workspace-tree-flat-list";

function makeItem(
  overrides: Partial<WorkspaceResourceEntity> & { id: string }
): WorkspaceResourceEntity {
  return {
    workspace_id: "workspace_1",
    name: "doc",
    icon: null,
    position: 0,
    parent_id: null,
    resource_type_id: "markdown",
    schema_version: 1,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

describe("WorkspaceTreeFlatList", () => {
  beforeEach(() => {
    openResource.mockClear();
  });

  it("renders empty-state copy when results is empty", () => {
    render(<WorkspaceTreeFlatList activeIndex={-1} results={[]} />);
    expect(screen.getByText("explorer.searchNoResults")).toBeTruthy();
  });

  it("renders results as listbox with option semantics", () => {
    render(
      <WorkspaceTreeFlatList
        activeIndex={0}
        results={[
          makeItem({ id: "1", name: "alpha" }),
          makeItem({ id: "2", name: "beta" }),
        ]}
      />
    );
    const list = screen.getByRole("listbox");
    expect(list).toBeTruthy();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    expect(options[1]?.getAttribute("aria-selected")).toBe("false");
  });

  it("calls openResource with name + ids when row clicked", () => {
    render(
      <WorkspaceTreeFlatList
        activeIndex={0}
        results={[
          makeItem({
            id: "1",
            name: "alpha",
            resource_type_id: "md",
          }),
        ]}
      />
    );
    fireEvent.click(screen.getAllByRole("button")[0] as HTMLElement);
    expect(openResource).toHaveBeenCalledWith({
      parentId: null,
      resourceId: "1",
      resourceTypeId: "md",
      schemaVersion: 1,
      title: "alpha",
    });
  });

  it("uses untitled label when name is empty", () => {
    render(
      <WorkspaceTreeFlatList
        activeIndex={0}
        results={[makeItem({ id: "1", name: "" })]}
      />
    );
    expect(screen.getByText("common.untitled")).toBeTruthy();
  });

  it("does not open when resource_type_id is missing", () => {
    render(
      <WorkspaceTreeFlatList
        activeIndex={0}
        results={[
          makeItem({ id: "1", name: "orphan", resource_type_id: null }),
        ]}
      />
    );
    fireEvent.click(screen.getAllByRole("button")[0] as HTMLElement);
    expect(openResource).not.toHaveBeenCalled();
  });

  it("notifies onActiveIndexChange on real pointer movement", () => {
    const onActive = vi.fn();
    render(
      <WorkspaceTreeFlatList
        activeIndex={0}
        onActiveIndexChange={onActive}
        results={[
          makeItem({ id: "1", name: "alpha" }),
          makeItem({ id: "2", name: "beta" }),
        ]}
      />
    );
    fireEvent.pointerMove(screen.getAllByRole("button")[1] as HTMLElement);
    expect(onActive).toHaveBeenCalledWith(1);
  });

  it("renders listbox + option roles in empty state", () => {
    render(<WorkspaceTreeFlatList activeIndex={-1} listId="lb" results={[]} />);
    expect(screen.getByRole("listbox").id).toBe("lb");
    expect(screen.getByText("explorer.searchNoResults")).toBeTruthy();
  });

  it("applies listId as option id prefix", () => {
    render(
      <WorkspaceTreeFlatList
        activeIndex={0}
        listId="flatlist"
        results={[makeItem({ id: "1", name: "alpha" })]}
      />
    );
    const option = screen.getByRole("option");
    expect(option.id).toBe("flatlist-option-0");
  });
});

vi.mock("../../../extensions/use-preload-resource-renderer", () => ({
  usePreloadResourceRenderer: vi.fn(),
  usePreloadRichTextRenderer: vi.fn(),
}));
