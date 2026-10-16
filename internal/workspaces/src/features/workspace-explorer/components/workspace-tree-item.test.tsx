/** @vitest-environment happy-dom */

import type { ItemInstance } from "@lunarisapp/ui/components/tree";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  contextMenuContent,
  preloadRenderer,
  useResourceType,
  useView,
  useYjsStorageIntentPreload,
} = vi.hoisted(() => ({
  contextMenuContent: vi.fn(() => null),
  preloadRenderer: vi.fn(),
  useResourceType: vi.fn(),
  useView: vi.fn(),
  useYjsStorageIntentPreload: vi.fn(() => ({})),
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({
  useResourceType,
  useView,
}));

vi.mock("@lunarisapp/ui/blocks/confirmation-dialog", () => ({
  ConfirmationDialog: () => null,
}));

vi.mock("@lunarisapp/ui/components/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@lunarisapp/ui/components/tree", () => ({
  TreeItem: ({ render: content }: { render: ReactNode }) => <>{content}</>,
  TreeItemLabel: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@lunarisapp/ui/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@repo/data/features/workspace-storage-slots", () => ({
  useWorkspaceStorageSlots: () => ({
    data: [
      { id: "storage-1", kind: "yjs", name: "content", resource_id: "item-1" },
    ],
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("react-router", () => ({
  useParams: () => ({
    workspaceSlug: "workspace",
    organizationSlug: "organization",
  }),
}));

vi.mock("../../workspace", () => ({
  useCurrentWorkspace: () => ({ workspaceId: "workspace-1" }),
}));

vi.mock("../../organization-navigation", () => ({
  useOrganizationNavigation: () => ({ openResource: vi.fn() }),
}));

vi.mock("../hooks/use-available-resources", () => ({
  useAvailableResources: () => [],
}));

vi.mock("../hooks/use-preload-visible-resource", () => ({
  useYjsStorageIntentPreload,
}));

vi.mock("../hooks/use-workspace-resource-creation", () => ({
  useWorkspaceResourceCreation: () => ({
    canCreate: true,
    createFolder: vi.fn(),
    createResource: vi.fn(),
  }),
}));

vi.mock("../store", () => ({
  useWorkspaceActions: () => ({
    deleteResources: vi.fn(),
    duplicateResource: vi.fn(),
  }),
  useWorkspaceResourcesMap: () => new Map(),
}));

vi.mock("./workspace-tree-item-actions", () => ({
  WorkspaceTreeItemContextMenuContent: contextMenuContent,
}));

vi.mock("./workspace-tree-item-content", () => ({
  WorkspaceTreeItemIcon: () => null,
  WorkspaceTreeItemLabel: () => null,
}));

import { WorkspaceTreeItem } from "./workspace-tree-item";

function makeItem(): ItemInstance<WorkspaceResourceEntity> {
  const data = {
    id: "item-1",
    name: "Singleton",
    resource_type_id: "plugin.singleton",
  } as WorkspaceResourceEntity;

  return {
    getId: () => data.id,
    getItemData: () => data,
    getItemName: () => data.name,
  } as ItemInstance<WorkspaceResourceEntity>;
}

describe("WorkspaceTreeItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useResourceType.mockReturnValue({
      defaultViewId: "plugin.singleton.view",
      icon: {},
      storage: {},
    });
    useView.mockReturnValue({ definition: { preload: preloadRenderer } });
  });

  it("uses registered resource type metadata for intent preload", () => {
    render(
      <WorkspaceTreeItem
        item={makeItem()}
        yjsStorage={{ storageId: "storage-1", documentId: "doc-1" }}
      />
    );

    expect(useResourceType).toHaveBeenCalledWith("plugin.singleton");
    expect(useYjsStorageIntentPreload).toHaveBeenCalledWith(
      { storageId: "storage-1", documentId: "doc-1" },
      "workspace-1",
      preloadRenderer,
      undefined
    );
  });

  it("allows duplicating typed resources without a legacy document ID", () => {
    render(
      <WorkspaceTreeItem
        item={makeItem()}
        yjsStorage={{ storageId: "storage-1", documentId: "doc-1" }}
      />
    );

    expect(contextMenuContent).toHaveBeenCalledWith(
      expect.objectContaining({ canDuplicate: true }),
      undefined
    );
  });

  it("does not offer duplication for resources with file storage", () => {
    useResourceType.mockReturnValue({
      defaultViewId: "plugin.singleton.view",
      icon: {},
      storage: { content: { kind: "file" } },
    });

    render(
      <WorkspaceTreeItem
        item={makeItem()}
        yjsStorage={{ storageId: "storage-1", documentId: "doc-1" }}
      />
    );

    expect(contextMenuContent).toHaveBeenCalledWith(
      expect.objectContaining({ canDuplicate: false }),
      undefined
    );
  });
});
