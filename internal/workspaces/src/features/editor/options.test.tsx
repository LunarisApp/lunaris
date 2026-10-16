import { render, screen } from "@testing-library/react";
import type { ResourceCommandContext } from "@lunarisapp/plugin-sdk";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorOptions } from "./options";

const openRightDockPanelMock = vi.fn();
const testState = vi.hoisted(() => ({
  resourceReadContext: {
    getYjsDocumentUpdates: vi.fn(),
    resolveResource: vi.fn().mockResolvedValue({ status: "ready" }),
  },
  exportAction: vi.fn(),
  isMobile: false,
  waitForPersistence: vi.fn(() => Promise.resolve()),
}));

vi.mock("@repo/data/core", () => ({
  usePowerSync: () => ({ name: "db" }),
}));

vi.mock("@repo/data/features/yjs", () => ({
  waitForYjsDocumentPersistence: testState.waitForPersistence,
}));

vi.mock("@repo/data/features/workspace-storage-slots", () => ({
  useResourceStorageSlots: () => ({
    data: [
      {
        backing_id: "yjs_1",
        id: "storage_1",
        kind: "yjs",
        name: "content",
      },
    ],
  }),
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({
  useResourceCommands: () => [
    {
      definition: {
        commands: [
          {
            children: [
              {
                id: "export-pdf",
                iconElement: <span data-testid="custom-action-icon" />,
                labelKey: "extensions.catalog.lunaris.rich-text.exportPdf",
                onExecute: testState.exportAction,
              },
              {
                id: "export-markdown",
                labelKey: "extensions.catalog.lunaris.rich-text.exportMarkdown",
                onExecute: testState.exportAction,
              },
            ],
            icon: {},
            id: "export-as",
            labelKey: "extensions.catalog.lunaris.rich-text.exportAs",
          },
          {
            icon: {},
            id: "version-history",
            labelKey: "common.versionHistory",
            onExecute: ({ resourceId, openView }: ResourceCommandContext) =>
              openView({
                viewId: "lunaris.rich-text.version-history",
                titleKey: "common.versionHistory",
                params: { resourceId },
              }),
          },
        ],
      },
    },
  ],
  useViews: () => [
    {
      definition: {
        target: { kind: "standalone" },
        viewId: "lunaris.rich-text.version-history",
      },
      extensionId: "lunaris.rich-text",
    },
  ],
  useFileStorage: () => {
    throw new Error("Scoped extension hook must not be used by host UI");
  },
  usePluginResourceReadContext: () => {
    throw new Error("Scoped extension hook must not be used by host UI");
  },
}));

vi.mock("@lunarisapp/plugin-sdk/internal", () => ({
  usePluginSdkRuntime: () => ({
    host: {
      useResourceReadContext: () => testState.resourceReadContext,
      useFileStorage: () => ({ download: vi.fn(), upload: vi.fn() }),
    },
  }),
}));

vi.mock("@lunarisapp/ui/blocks/confirmation-dialog", () => ({
  ConfirmationDialog: () => null,
}));

vi.mock("@lunarisapp/ui/blocks/rename-dialog", () => ({
  RenameDialog: () => null,
}));

vi.mock("@lunarisapp/ui/blocks/responsive-dropdown-menu", () => ({
  ResponsiveDropdownMenu: ({
    children,
    onOpenChange,
  }: {
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div>
      {children}
      <button onClick={() => onOpenChange?.(false)} type="button">
        close-menu
      </button>
    </div>
  ),
  ResponsiveDropdownMenuContent: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div>{children}</div>,
  ResponsiveDropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  ResponsiveDropdownMenuSeparator: () => <div />,
  ResponsiveDropdownMenuTrigger: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <button>{children}</button>,
}));

vi.mock("@lunarisapp/ui/components/dropdown-menu", () => ({
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));

vi.mock("@lunarisapp/ui/components/button", () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: React.ComponentProps<"button"> & { size?: string; variant?: string }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@lunarisapp/ui/hooks/use-mobile", () => ({
  useIsMobile: () => testState.isMobile,
}));

vi.mock("@lunarisapp/ui/icons", () => ({
  ArrowLeft01Icon: {},
  ArrowRight01Icon: {},
  Delete02Icon: {},
  Edit02Icon: {},
  HugeiconsIcon: () => null,
  MoreHorizontal: {},
  ScanEyeIcon: {},
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../grid-layout/context", () => ({
  useGridLayoutStore: (
    selector: (state: {
      openRightDockPanel: typeof openRightDockPanelMock;
    }) => unknown
  ) => selector({ openRightDockPanel: openRightDockPanelMock }),
}));

vi.mock("@repo/features/hotkeys", () => ({
  formatHotkeyDisplay: () => "F2",
}));

vi.mock("../workspace-explorer", () => ({
  useWorkspaceActions: () => ({
    deleteResource: vi.fn(),
    renameResource: vi.fn(),
  }),
  useWorkspaceResourcesMap: () =>
    new Map([["item_1", { name: "Document One" }]]),
}));

vi.mock("../workspace", () => ({
  useCurrentWorkspace: () => ({ workspaceId: "workspace_1" }),
}));

vi.mock("../organization-navigation", () => ({
  useOrganizationNavigation: () => ({
    clearRenamingResource: vi.fn(),
    openResource: vi.fn(),
    toggleFocusMode: vi.fn(),
  }),
  useOrganizationViewState: () => ({
    renamingResourceId: null,
  }),
}));

const resource = {
  documentId: "yjs_1",
  parentId: null,
  resourceId: "item_1",
  resourceTypeId: "lunaris.rich-text",
  schemaId: "lunaris.rich-text.document",
  schemaVersion: 1,
  storageKind: "yjs" as const,
};

describe("EditorOptions", () => {
  beforeEach(() => {
    openRightDockPanelMock.mockClear();
    testState.exportAction.mockClear();
    testState.isMobile = false;
    testState.waitForPersistence.mockClear();
  });

  it("passes plugin action context with host right-dock helper", async () => {
    const user = userEvent.setup();

    render(<EditorOptions resource={resource} />);

    await user.click(
      screen.getByRole("button", { name: /common.versionHistory/i })
    );

    expect(openRightDockPanelMock).toHaveBeenCalledWith({
      extensionId: "lunaris.rich-text",
      params: {
        resourceId: "item_1",
      },
      sourceResourceId: "item_1",
      title: "common.versionHistory",
      viewId: "lunaris.rich-text.version-history",
    });
  });

  it("renders grouped actions as desktop submenu commands", async () => {
    const user = userEvent.setup();

    render(<EditorOptions resource={resource} />);

    expect(
      screen.getByRole("button", {
        name: "extensions.catalog.lunaris.rich-text.exportAs",
      })
    ).toBeTruthy();
    expect(screen.getByTestId("custom-action-icon")).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "extensions.catalog.lunaris.rich-text.exportPdf",
      })
    );

    expect(testState.exportAction).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: "item_1",
        resourceTypeId: "lunaris.rich-text",
        resourceName: "Document One",
        resourceReadContext: testState.resourceReadContext,
        storage: { content: { kind: "yjs", storageId: "storage_1" } },
        waitForYjsPersistence: expect.any(Function),
      })
    );

    const context = testState.exportAction.mock.calls[0]?.[0];
    await context?.waitForYjsPersistence?.({
      kind: "yjs",
      storageId: "storage_1",
    });
    expect(testState.waitForPersistence).toHaveBeenCalledWith({
      db: { name: "db" },
      documentId: "yjs_1",
    });
  });

  it("navigates grouped actions on mobile and resets after close", async () => {
    testState.isMobile = true;
    const user = userEvent.setup();

    render(<EditorOptions resource={resource} />);

    expect(
      screen.queryByRole("button", {
        name: "extensions.catalog.lunaris.rich-text.exportPdf",
      })
    ).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: "extensions.catalog.lunaris.rich-text.exportAs",
      })
    );

    expect(
      screen.getByRole("button", {
        name: "extensions.catalog.lunaris.rich-text.exportPdf",
      })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "common.versionHistory" })
    ).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: "common.back",
      })
    );

    expect(
      screen.getByRole("button", {
        name: "extensions.catalog.lunaris.rich-text.exportAs",
      })
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "extensions.catalog.lunaris.rich-text.exportAs",
      })
    );
    await user.click(screen.getByRole("button", { name: "close-menu" }));

    expect(
      screen.queryByRole("button", {
        name: "extensions.catalog.lunaris.rich-text.exportPdf",
      })
    ).toBeNull();
  });
});
