/** @vitest-environment happy-dom */

import type { ResourceTypeDefinition } from "@lunarisapp/plugin-sdk";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IDockviewPanelProps } from "dockview";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceCapacityExceededError } from "@repo/features/entitlements";

const mocks = vi.hoisted(() => ({
  createFolder: vi.fn(),
  createResource: vi.fn(),
  close: vi.fn(),
  openExplorer: vi.fn(),
  openResource: vi.fn(),
  openTool: vi.fn(),
  requestRenameResource: vi.fn(),
  startRenamingResource: vi.fn(),
  toastError: vi.fn(),
}));

const documentType = {
  defaultViewId: "rich-text.view",
  icon: [],
  name: "Document",
  resourceTypeId: "rich-text",
  schema: { currentVersion: 1, id: "rich-text.schema", versions: {} },
  storage: { kind: "yjs" },
} as unknown as ResourceTypeDefinition;

let availableResources: ResourceTypeDefinition[] = [documentType];

vi.mock("@lunarisapp/ui/blocks/responsive-dropdown-menu", () => ({
  ResponsiveDropdownMenu: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  ResponsiveDropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
  ResponsiveDropdownMenuTrigger: ({
    children,
    disabled,
  }: {
    children: ReactNode;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} type="button">
      {children}
    </button>
  ),
}));

vi.mock("../../workspace-explorer", () => ({
  useAvailableResources: () => availableResources,
  useWorkspaceActions: () => ({
    createFolder: mocks.createFolder,
    createResource: mocks.createResource,
  }),
  useStartRenamingItem: () => mocks.startRenamingResource,
  VIRTUAL_ROOT_ID: "virtual-root",
}));

vi.mock("../../organization-navigation", () => ({
  useOrganizationNavigation: () => ({
    openExplorer: mocks.openExplorer,
    openResource: mocks.openResource,
    openTool: mocks.openTool,
  }),
}));

vi.mock("../context", () => ({
  useGridLayoutStore: (
    selector: (state: { requestRenameResource: typeof mocks.requestRenameResource }) => unknown
  ) => selector({ requestRenameResource: mocks.requestRenameResource }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "common.untitled": "Untitled",
        "errors.reason.entitlements.resourceLimit.desc": "Upgrade to add more items",
        "gridLayout.emptyPanel.heading": "Start something new",
        "gridLayout.emptyPanel.description": "Create workspace content.",
        "gridLayout.emptyPanel.createFile": "Create new file",
        "gridLayout.emptyPanel.createFileDescription": "Choose a file type.",
        "gridLayout.emptyPanel.createFileError": "Failed to create file",
        "gridLayout.emptyPanel.chooseFileType": "Choose a file type",
        "gridLayout.emptyPanel.noFileTypes": "No file types available.",
        "gridLayout.emptyPanel.createFolder": "Create new folder",
        "gridLayout.emptyPanel.createFolderDescription": "Add a folder.",
        "gridLayout.emptyPanel.createFolderError": "Failed to create folder",
        "gridLayout.emptyPanel.exploreExtensions": "Explore extensions",
        "gridLayout.emptyPanel.exploreExtensionsDescription": "Find tools.",
      })[key] ?? key,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

import { GridLayoutEmptyPanel } from "./empty-panel";

function renderEmptyPanel() {
  const props = {
    api: {
      close: mocks.close,
      group: { id: "group-main" },
    },
  } as unknown as IDockviewPanelProps;
  return render(<GridLayoutEmptyPanel {...props} />);
}

describe("GridLayoutEmptyPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    availableResources = [documentType];
  });

  it("creates, opens, and requests rename for a selected file type", async () => {
    mocks.createResource.mockResolvedValue({
      documentId: "yjs-new",
      name: "",
      resourceId: "item-new",
    });
    const user = userEvent.setup();
    renderEmptyPanel();

    expect(screen.getByText("Create new file")).toBeTruthy();
    expect(screen.getByText("Create new folder")).toBeTruthy();
    expect(screen.getByText("Explore extensions")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Document" }));

    await waitFor(() => {
      expect(mocks.createResource).toHaveBeenCalledWith("virtual-root", documentType);
    });
    expect(mocks.openResource).toHaveBeenCalledWith({
      resourceId: "item-new",
      resourceTypeId: "rich-text",
      schemaVersion: 1,
      target: { direction: "within", groupId: "group-main" },
      title: "Untitled",
    });
    expect(mocks.requestRenameResource).toHaveBeenCalledWith("item-new");
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("keeps launcher open when file upload is cancelled", async () => {
    availableResources = [
      {
        ...documentType,
        resourceTypeId: "file",
        name: "File",
      },
    ];
    mocks.createResource.mockResolvedValue(null);
    const user = userEvent.setup();
    renderEmptyPanel();

    await user.click(screen.getByRole("button", { name: "File" }));
    await waitFor(() => expect(mocks.createResource).toHaveBeenCalledOnce());

    expect(mocks.openResource).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it("opens hierarchy and queues inline rename for a new folder", async () => {
    mocks.createFolder.mockResolvedValue("folder-new");
    const user = userEvent.setup();
    renderEmptyPanel();

    await user.click(
      screen.getByRole("button", { name: /Create new folder/u })
    );

    await waitFor(() =>
      expect(mocks.createFolder).toHaveBeenCalledWith("virtual-root")
    );
    expect(mocks.openExplorer).toHaveBeenCalledOnce();
    expect(mocks.startRenamingResource).toHaveBeenCalledWith("folder-new");
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("opens extensions in the launcher group", async () => {
    const user = userEvent.setup();
    renderEmptyPanel();

    await user.click(
      screen.getByRole("button", { name: /Explore extensions/u })
    );

    expect(mocks.openTool).toHaveBeenCalledWith({
      target: { direction: "within", groupId: "group-main" },
      toolId: "extensions",
    });
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("reports creation errors without closing launcher", async () => {
    mocks.createResource.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    renderEmptyPanel();

    await user.click(screen.getByRole("button", { name: "Document" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Failed to create file"
      )
    );

    expect(mocks.close).not.toHaveBeenCalled();
  });

  it("explains when item capacity blocks creation", async () => {
    mocks.createResource.mockRejectedValue(new ResourceCapacityExceededError(25));
    const user = userEvent.setup();
    renderEmptyPanel();

    await user.click(screen.getByRole("button", { name: "Document" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Upgrade to add more items")
    );
  });
});
