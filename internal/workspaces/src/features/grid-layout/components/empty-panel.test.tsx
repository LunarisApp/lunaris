/** @vitest-environment happy-dom */

import type { ResourceTypeDefinition } from "@lunarisapp/plugin-sdk";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { HotkeyOverridesProvider } from "@repo/features/hotkeys";
import { SearchDialog } from "../../search/components/search-dialog";
import { SearchProvider } from "../../search/hooks/useSearchDialog";
import { SearchButton } from "../../search/components/search-button";
import type { IDockviewPanelProps } from "dockview";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceCapacityExceededError } from "@repo/features/entitlements";

const mocks = vi.hoisted(() => ({
  askAgent: vi.fn(),
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

const createdRows = new Map<
  string,
  { id: string; name: string; resource_type_id: string; schema_version: number }
>();

let availableResources: ResourceTypeDefinition[] = [documentType];

vi.mock("@lunarisapp/plugin-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lunarisapp/plugin-sdk")>()),
  useResourceTypes: () => availableResources,
}));

vi.mock("../../workspace-explorer", async () => ({
  ...(await import("../../workspace-explorer/hooks/use-available-resources")),
  useWorkspaceActions: () => ({
    createFolder: mocks.createFolder,
    createResource: mocks.createResource,
  }),
  useWorkspaceResources: () => [],
  useStartRenamingItem: () => mocks.startRenamingResource,
  VIRTUAL_ROOT_ID: "virtual-root",
}));

vi.mock("../../workspace-explorer/store", () => ({
  useWorkspaceActions: () => ({ createResource: mocks.createResource }),
  useWorkspaceResourcesMap: () => new Map(createdRows),
}));
vi.mock("@repo/features/auth", () => ({
  useAuth: () => ({ useSession: () => ({ data: { user: { id: "user" } } }) }),
}));
vi.mock("../../search/hooks/useSearchAgentPrompt", () => ({
  useSearchAgentPrompt: () => mocks.askAgent,
}));
vi.mock("../../workspace", () => ({
  useCurrentWorkspace: () => ({
    workspaceId: "workspace",
    workspace: { slug: "workspace" },
  }),
}));
vi.mock("../../search/search-index-coordinator", () => ({
  SearchIndexCoordinator: () => null,
}));
vi.mock("../../search/hooks/useWorkspaceSearch", () => ({
  useWorkspaceSearch: () => [],
}));
vi.mock("../../search/hooks/useResourceSearch", () => ({
  useResourceSearch: () => [],
}));
vi.mock("../../search/hooks/useResourceContentSearch", () => ({
  useResourceContentSearch: () => [],
}));
vi.mock("../../search/hooks/useSearchResourceTypes", () => ({
  useSearchResourceTypes: () => new Map(),
}));
vi.mock("../../../extensions/use-preload-resource-renderer", () => ({
  usePreloadResourceRenderer: vi.fn(),
}));
vi.mock("@repo/features/region", () => ({
  useRegion: () => ({ pathWithRegion: (p: string) => p }),
}));
vi.mock("@tanstack/react-hotkeys", () => ({ useHotkey: vi.fn() }));
vi.mock("../../organization-navigation", () => ({
  useOrganizationViewState: () => ({ activeViewInstanceId: null }),
  useOrganizationNavigation: () => ({
    openExplorer: mocks.openExplorer,
    openResource: mocks.openResource,
    openTool: mocks.openTool,
  }),
}));

vi.mock("../context", () => ({
  useGridLayoutStore: (
    selector: (state: {
      requestRenameResource: typeof mocks.requestRenameResource;
    }) => unknown
  ) => selector({ requestRenameResource: mocks.requestRenameResource }),
}));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, values?: { type: string }) =>
      ({
        "commands.createResource": `Create ${values?.type}`,
        "common.untitled": "Untitled",
        "errors.reason.entitlements.resourceLimit.desc":
          "Upgrade to add more items",
        "gridLayout.emptyPanel.heading": "Start something new",
        "gridLayout.emptyPanel.description": "Create workspace content.",
        "gridLayout.emptyPanel.createFile": "Create new file",
        "gridLayout.emptyPanel.createFileDescription": "Choose a file type.",
        "explorer.failedToCreateResource": "Failed to create file",
        "explorer.searchResourceTypes": "Search resource types",
        "explorer.noMatchingTypes": "No matching resource types.",
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
  const ui = () => (
    <MemoryRouter>
      <HotkeyOverridesProvider>
        <SearchProvider indexingReady={false}>
          <GridLayoutEmptyPanel {...props} />
          <SearchButton />
          <SearchDialog />
        </SearchProvider>
      </HotkeyOverridesProvider>
    </MemoryRouter>
  );
  const panel = render(ui());
  return () => panel.rerender(ui());
}

describe("GridLayoutEmptyPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdRows.clear();
    availableResources = [documentType];
  });

  it("submits an unmatched workspace search to Agent with Enter", async () => {
    const user = userEvent.setup();
    renderEmptyPanel();
    await user.click(screen.getByRole("button", { name: "common.search" }));
    expect(
      screen.queryByRole("option", { name: "search.askAgent" })
    ).toBeNull();
    await user.type(screen.getByRole("combobox"), "Outline this chapter");
    expect(
      await screen.findByRole("option", { name: "search.askAgent" })
    ).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(mocks.askAgent).toHaveBeenCalledExactlyOnceWith(
      "Outline this chapter"
    );
  });

  it("lists Rich Text, Kanban, and File first, then other types by display name", async () => {
    availableResources = [
      ["custom.a", "Whiteboard"],
      ["lunaris.file", "File"],
      ["custom.z", "Calendar"],
      ["lunaris.kanban", "Kanban Board"],
      ["lunaris.rich-text", "Rich Text"],
    ].map(([resourceTypeId, name]) => ({
      ...documentType,
      resourceTypeId,
      name,
    }));
    const user = userEvent.setup();
    renderEmptyPanel();
    await user.click(screen.getByRole("button", { name: /Create new file/u }));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Rich Text",
      "Kanban Board",
      "File",
      "Calendar",
      "Whiteboard",
    ]);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
  });

  it("preserves fill-only artwork in resource search results", async () => {
    availableResources = [
      {
        ...documentType,
        icon: [["path", { d: "M2 2h20v20H2z", fill: "currentColor" }]],
        name: "Excalidraw",
      },
    ];
    const user = userEvent.setup();
    renderEmptyPanel();
    await user.click(screen.getByRole("button", { name: /Create new file/u }));
    const option = await screen.findByRole("option", { name: "Excalidraw" });
    const path = option.querySelector('path[fill="currentColor"]');
    expect(path).toBeTruthy();
    expect(path?.closest("[stroke]")).toBeNull();
  });

  it("creates, opens, and requests rename for a selected file type", async () => {
    mocks.createResource.mockResolvedValue({
      documentId: "yjs-new",
      name: "",
      resourceId: "item-new",
    });
    const user = userEvent.setup();
    const rerender = renderEmptyPanel();

    expect(screen.getByText("Create new file")).toBeTruthy();
    expect(screen.getByText("Create new folder")).toBeTruthy();
    expect(screen.getByText("Explore extensions")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Create new file/u }));
    await user.click(await screen.findByRole("option", { name: "Document" }));

    await waitFor(() => {
      expect(mocks.createResource).toHaveBeenCalledWith(
        "__root__",
        documentType
      );
    });
    expect(mocks.openResource).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
    createdRows.set("item-new", {
      id: "item-new",
      name: "",
      resource_type_id: "rich-text",
      schema_version: 1,
    });
    rerender();
    await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
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

  it("filters extension types, resets on dismissal, and creates by keyboard", async () => {
    const board = {
      ...documentType,
      resourceTypeId: "board",
      name: "Kanban Board",
    };
    availableResources = [documentType, board];
    mocks.createResource.mockResolvedValue(null);
    const user = userEvent.setup();
    renderEmptyPanel();
    const trigger = screen.getByRole("button", { name: /Create new file/u });
    await user.click(trigger);
    const input = await screen.findByRole("combobox", {
      name: "Search resource types",
    });
    await waitFor(() => expect(document.activeElement).toBe(input));
    await user.keyboard("xyz");
    expect(await screen.findByText("No matching resource types.")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.createResource).not.toHaveBeenCalled();

    await user.click(trigger);
    expect(
      await screen.findByRole("option", { name: "Document" })
    ).toBeTruthy();
    await user.type(screen.getByRole("combobox"), "kanban");
    expect(screen.queryByRole("option", { name: "Document" })).toBeNull();
    await user.keyboard("{Enter}");
    expect(mocks.createResource).toHaveBeenCalledExactlyOnceWith(
      "__root__",
      board
    );
  });

  it("uses the root and active panel for a fresh search after dismissing the launcher", async () => {
    createdRows.set("root-resource", {
      id: "root-resource",
      name: "Notes",
      resource_type_id: "rich-text",
      schema_version: 1,
    });
    mocks.createResource.mockResolvedValue({
      resourceId: "root-resource",
      name: "Notes",
    });
    const user = userEvent.setup();
    renderEmptyPanel();
    await user.click(screen.getByRole("button", { name: /Create new file/u }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "common.search" }));
    await user.type(screen.getByRole("combobox"), "create doc");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(mocks.createResource).toHaveBeenCalledExactlyOnceWith(
        "__root__",
        documentType
      )
    );
    expect(mocks.openResource).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: "root-resource",
        target: undefined,
      })
    );
    expect(mocks.close).not.toHaveBeenCalled();
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

    await user.click(screen.getByRole("button", { name: /Create new file/u }));
    await user.click(await screen.findByRole("option", { name: "File" }));
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

    await user.click(screen.getByRole("button", { name: /Create new file/u }));
    await user.click(await screen.findByRole("option", { name: "Document" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Failed to create file")
    );

    expect(mocks.close).not.toHaveBeenCalled();
  });

  it("explains when item capacity blocks creation", async () => {
    mocks.createResource.mockRejectedValue(
      new ResourceCapacityExceededError(25)
    );
    const user = userEvent.setup();
    renderEmptyPanel();

    await user.click(screen.getByRole("button", { name: /Create new file/u }));
    await user.click(await screen.findByRole("option", { name: "Document" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Upgrade to add more items")
    );
  });
});
