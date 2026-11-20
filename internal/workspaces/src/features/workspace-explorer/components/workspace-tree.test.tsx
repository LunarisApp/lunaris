/** @vitest-environment happy-dom */

import type { CreateResourceCommand } from "../../search/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppToolVisibility } from "@repo/features/appbar";
import type { MouseEventHandler, ReactNode, RefObject } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stableLoadingState = vi.hoisted(() => ({
  showEmpty: false,
  showSkeleton: false,
}));

interface TreeHotkeyArgs {
  target: RefObject<HTMLDivElement | null>;
}

const useDeleteKeyboardShortcutMock = vi.fn((_args: TreeHotkeyArgs) => ({
  confirmDeleteOpen: false,
  handleConfirmDelete: vi.fn(),
  itemsToDelete: [],
  setConfirmDeleteOpen: vi.fn(),
}));
const useRenameKeyboardShortcutMock = vi.fn((_args: TreeHotkeyArgs) => {});
const useResourceClipboardShortcutsMock = vi.fn((_args: TreeHotkeyArgs) => {});
const addItemMock = vi.fn();
const navigateToResourceMock = vi.fn();
const startRenamingResourceMock = vi.fn();
const openResourceMock = vi.fn();
const registerTreeMock = vi.fn();
const expand = vi.fn();
const tree = {
  collapseAll: vi.fn(),
  getItemInstance: vi.fn(() => ({ expand })),
  getItems: () => [{ getId: () => "item-1" }],
  setSelectedItems: vi.fn(),
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@lunarisapp/ui/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@lunarisapp/ui/blocks/confirmation-dialog", () => ({
  ConfirmationDialog: ({ open }: { open: boolean }) =>
    open ? <div role="alertdialog" aria-label="Delete resources" /> : null,
}));

vi.mock("@lunarisapp/ui/components/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  ContextMenuTrigger: ({
    children,
    className,
    onClick,
  }: {
    children: ReactNode;
    className?: string;
    onClick?: MouseEventHandler<HTMLDivElement>;
  }) => (
    <div className={className} onClick={onClick}>
      {children}
    </div>
  ),
}));

vi.mock("@lunarisapp/ui/components/tree", () => ({
  AssistiveTreeDescription: () => null,
  Tree: ({ children }: { children: ReactNode }) => (
    <div data-testid="tree-root">{children}</div>
  ),
  TreeDragLine: () => null,
}));

vi.mock("@repo/features/sync-status", () => ({
  useStableInitialLoading: () => stableLoadingState,
}));

vi.mock("../../organization-navigation", () => ({
  useOrganizationNavigation: () => ({
    openResource: openResourceMock,
  }),
}));

vi.mock("../../search/hooks/useSearchDialog", () => ({
  useSearchDialogStore: () => (create: CreateResourceCommand) =>
    create({
      resourceTypeId: "lunaris.file",
      name: "File",
      icon: [],
      schema: { currentVersion: 1 },
    } as Parameters<CreateResourceCommand>[0]),
}));

vi.mock("../hooks/use-delete-keyboard-shortcut", () => ({
  useDeleteKeyboardShortcut: (args: TreeHotkeyArgs) =>
    useDeleteKeyboardShortcutMock(args),
}));

vi.mock("../hooks/use-resource-clipboard-shortcuts", () => ({
  useResourceClipboardShortcuts: (args: TreeHotkeyArgs) =>
    useResourceClipboardShortcutsMock(args),
}));

vi.mock("../hooks/use-filtered-resources", () => ({
  useFilteredResources: (query: string) =>
    query
      ? [
          {
            id: "result-1",
            resource_type_id: "plugin.rich-text",
            name: "Result",
          },
        ]
      : [],
}));

vi.mock("../hooks/use-workspace-tree", () => ({
  useWorkspaceTree: () => ({ tree }),
}));

vi.mock("../hooks/use-workspace-resource-creation", () => ({
  useWorkspaceResourceCreation: () => ({
    canCreate: true,
    createFolder: vi.fn(),
    createResource: addItemMock,
  }),
}));

vi.mock("../hooks/use-rename-keyboard-shortcut", () => ({
  useRenameKeyboardShortcut: (args: TreeHotkeyArgs) =>
    useRenameKeyboardShortcutMock(args),
}));

vi.mock("../store", () => ({
  useWorkspaceActions: () => ({
    createFolder: vi.fn(),
    createResource: addItemMock,
  }),
  useWorkspaceResources: () => [{ id: "item-1" }],
  useWorkspaceTrashMap: () => new Map(),
  useRegisterTree: () => registerTreeMock,
  useStartRenamingItem: () => startRenamingResourceMock,
  useNavigateToResource: () => navigateToResourceMock,
}));

vi.mock("../utils", () => ({
  getDeleteDescriptionI18n: () => ({
    key: "explorer.deleteConfirmation",
    params: {},
  }),
}));

vi.mock("./context-menu-config", () => ({
  AddFolderMenuItem: () => null,
  AddResourceMenuItem: ({ onAddResource }: { onAddResource: () => void }) => (
    <button onClick={onAddResource} type="button">
      add resource
    </button>
  ),
}));

vi.mock("./workspace-tree-empty", () => ({
  WorkspaceTreeEmpty: () => <div>empty</div>,
}));

vi.mock("./workspace-tree-flat-list", () => ({
  WorkspaceTreeFlatList: () => <div data-testid="search-list">search</div>,
}));

vi.mock("./workspace-tree-header", () => ({
  WorkspaceTreeHeader: ({
    onSearchChange,
  }: {
    onSearchChange: (value: string) => void;
  }) => (
    <button onClick={() => onSearchChange("query")} type="button">
      search
    </button>
  ),
}));

vi.mock("./workspace-tree-item", () => ({
  WorkspaceTreeItem: ({
    item,
    onAddResource,
  }: {
    item: { getId: () => string };
    onAddResource: (parentId: string) => void;
  }) => (
    <button type="button" onClick={() => onAddResource(item.getId())}>
      add inside folder
    </button>
  ),
}));

vi.mock("./workspace-tree-skeleton", () => ({
  WorkspaceTreeSkeleton: () => <div>skeleton</div>,
}));

import { WorkspaceExplorerTree } from "./workspace-tree";

describe("WorkspaceExplorerTree", () => {
  beforeEach(() => {
    expand.mockClear();
    addItemMock.mockReset();
    openResourceMock.mockReset();
    navigateToResourceMock.mockReset();
    startRenamingResourceMock.mockReset();
    stableLoadingState.showEmpty = false;
    stableLoadingState.showSkeleton = false;
  });

  it("shows workspace tree skeleton immediately", () => {
    stableLoadingState.showSkeleton = true;

    render(<WorkspaceExplorerTree />);

    expect(screen.getByText("skeleton")).toBeTruthy();
  });

  it("suspends the delete confirmation while another tool is active", () => {
    useDeleteKeyboardShortcutMock.mockReturnValue({
      confirmDeleteOpen: true,
      handleConfirmDelete: vi.fn(),
      itemsToDelete: [],
      setConfirmDeleteOpen: vi.fn(),
    });
    const tree = (active: boolean) => (
      <AppToolVisibility active={active}>
        <WorkspaceExplorerTree />
      </AppToolVisibility>
    );
    try {
      const view = render(tree(true));
      expect(screen.getByRole("alertdialog")).toBeTruthy();
      view.rerender(tree(false));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      view.rerender(tree(true));
      expect(screen.getByRole("alertdialog")).toBeTruthy();
    } finally {
      useDeleteKeyboardShortcutMock.mockReset();
    }
  });

  it("removes workspace tree skeleton when loading resolves", () => {
    stableLoadingState.showSkeleton = true;

    const view = render(<WorkspaceExplorerTree />);
    expect(screen.getByText("skeleton")).toBeTruthy();

    stableLoadingState.showSkeleton = false;
    view.rerender(<WorkspaceExplorerTree />);

    expect(screen.queryByText("skeleton")).toBeNull();
  });

  it("passes the tree-region ref to tree hotkey hooks", () => {
    render(<WorkspaceExplorerTree />);

    const treeRoot = screen.getByTestId("tree-root");
    const deleteArgs = useDeleteKeyboardShortcutMock.mock.lastCall?.[0];
    const clipboardArgs = useResourceClipboardShortcutsMock.mock.lastCall?.[0];
    const renameArgs = useRenameKeyboardShortcutMock.mock.lastCall?.[0];

    expect(deleteArgs?.target).toBe(clipboardArgs?.target);
    expect(deleteArgs?.target).toBe(renameArgs?.target);
    expect(deleteArgs?.target.current).not.toBeNull();
    expect(deleteArgs?.target.current).not.toBe(treeRoot);
    expect(deleteArgs?.target.current?.contains(treeRoot)).toBe(true);
  });

  it("places trash left and workspace actions right in the footer", () => {
    render(
      <WorkspaceExplorerTree
        footerActions={
          <>
            <button type="button">Extensions</button>
            <button type="button">Settings</button>
          </>
        }
      />
    );

    const leading = screen.getByTestId("workspace-explorer-footer-leading");
    const trailing = screen.getByTestId("workspace-explorer-footer-trailing");

    expect(
      leading.querySelector("[data-testid='workspace-trash-trigger']")
    ).not.toBeNull();
    expect(
      Array.from(trailing.children).map((child) => child.textContent)
    ).toEqual(["Extensions", "Settings"]);
  });

  it("clears the tree hotkey target when search results replace the tree", () => {
    render(<WorkspaceExplorerTree />);

    fireEvent.click(screen.getByRole("button", { name: "search" }));

    expect(screen.getByTestId("search-list")).toBeTruthy();
    const deleteArgs = useDeleteKeyboardShortcutMock.mock.lastCall?.[0];
    const clipboardArgs = useResourceClipboardShortcutsMock.mock.lastCall?.[0];
    const renameArgs = useRenameKeyboardShortcutMock.mock.lastCall?.[0];

    expect(deleteArgs?.target).toBe(clipboardArgs?.target);
    expect(deleteArgs?.target).toBe(renameArgs?.target);
    expect(deleteArgs?.target.current).toBeNull();
  });

  it("adds inside the chosen folder, expands it, and starts renaming an untitled resource", async () => {
    addItemMock.mockResolvedValue({ resourceId: "new-resource", name: "" });
    render(<WorkspaceExplorerTree />);
    fireEvent.click(screen.getByRole("button", { name: "add inside folder" }));
    await waitFor(() =>
      expect(startRenamingResourceMock).toHaveBeenCalledWith("new-resource")
    );
    expect(addItemMock).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ name: "File" })
    );
    expect(tree.getItemInstance).toHaveBeenCalledWith("item-1");
    expect(expand).toHaveBeenCalledOnce();
  });

  it("creates an uploaded resource at the root and opens it without renaming", async () => {
    addItemMock.mockResolvedValue({
      resourceId: "item-file",
      name: "notes.txt",
    });

    render(<WorkspaceExplorerTree />);

    fireEvent.click(screen.getByRole("button", { name: "add resource" }));

    await waitFor(() => {
      expect(addItemMock).toHaveBeenCalledWith(
        "__root__",
        expect.objectContaining({ resourceTypeId: "lunaris.file" })
      );
      expect(navigateToResourceMock).toHaveBeenCalledWith("item-file");
      expect(startRenamingResourceMock).not.toHaveBeenCalled();
    });
  });
});

vi.mock("../../workspace", () => ({
  useCurrentWorkspace: () => ({ workspaceId: "workspace-1" }),
}));
vi.mock("@repo/data/features/workspace-storage-slots", () => ({
  useWorkspaceStorageSlots: () => ({ data: [] }),
}));
