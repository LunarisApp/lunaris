/** @vitest-environment happy-dom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSettingsPanel } from "./workspace-settings-panel";

const {
  openTool,
  patchWorkspace,
  removeWorkspace,
  renameWorkspace,
  testState,
} = vi.hoisted(() => ({
  openTool: vi.fn(),
  patchWorkspace: vi.fn(() => Promise.resolve()),
  removeWorkspace: vi.fn(() => Promise.resolve()),
  renameWorkspace: vi.fn(() => Promise.resolve()),
  testState: {
    canUpdate: true,
    workspace: {
      id: "workspace_1",
      name: "Atlas",
      organization_id: "org_1",
      owner_id: null as string | null,
      slug: "atlas",
      visibility: "shared",
    },
    userId: "user_1",
  },
}));

vi.mock("@lunarisapp/ui/blocks/input-confirmation-dialog", () => ({
  InputConfirmationDialog: ({
    onConfirm,
    open,
  }: {
    onConfirm: () => void;
    open: boolean;
  }) =>
    open ? (
      <button data-testid="confirm-workspace-delete" onClick={onConfirm}>
        confirm
      </button>
    ) : null,
}));

vi.mock("@repo/data/core", () => ({
  SYNC_ACCESS: { cloud: "cloud", localOnly: "local-only" },
  usePowerSync: () => ({ id: "db" }),
  useSyncAccess: () => "cloud",
}));

vi.mock("@repo/data/features/workspaces", () => ({
  removeWorkspace,
  renameWorkspace,
}));

vi.mock("@repo/data/http", () => ({
  getUserFacingDescription: () => "error",
  getUserFacingError: () => ({ titleKey: "error" }),
}));

vi.mock("@repo/features/api", () => ({
  useApi: () => ({ patch: patchWorkspace }),
}));

vi.mock("@repo/features/auth", () => ({
  useAuth: () => ({
    useSession: () => ({ data: { user: { id: testState.userId } } }),
  }),
}));

vi.mock("@repo/features/permissions", () => ({
  usePermission: () => testState.canUpdate,
}));

vi.mock("@repo/workspaces/permissions", () => ({
  useCanDeleteWorkspace: () => true,
}));

vi.mock("@repo/workspaces/search", () => ({
  clearRecentFilesForWorkspace: vi.fn(),
}));

vi.mock("../workspace", () => ({
  useCurrentWorkspace: () => ({
    workspace: testState.workspace,
  }),
}));

vi.mock("@repo/features/region", () => ({
  useRegion: () => ({ pathWithRegion: (path: string) => path }),
}));

vi.mock("../organization-navigation", () => ({
  useOrganizationNavigation: () => ({ openTool }),
}));

vi.mock("./workspace-sharing-settings", () => ({
  WorkspaceSharingSettings: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("WorkspaceSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.canUpdate = true;
    testState.workspace.owner_id = null;
    testState.workspace.visibility = "shared";
    testState.userId = "user_1";
  });

  it("renames the current workspace without changing its slug", async () => {
    render(
      <MemoryRouter initialEntries={["/acme/atlas/settings"]}>
        <WorkspaceSettingsPanel />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByTestId("workspace-settings-name"), {
      target: { value: "Nova" },
    });
    fireEvent.click(screen.getByTestId("workspace-settings-save-name"));

    await waitFor(() => {
      expect(renameWorkspace).toHaveBeenCalledWith({
        db: { id: "db" },
        id: "workspace_1",
        name: "Nova",
        slug: "atlas",
      });
    });
  });

  it("opens extensions from its reference section", () => {
    render(
      <MemoryRouter>
        <WorkspaceSettingsPanel />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "workspaces.manageExtensions" }),
    );

    expect(openTool).toHaveBeenCalledWith({ toolId: "extensions" });
  });

  it("disables private workspace changes for non-owners", () => {
    testState.workspace.owner_id = "user_2";
    testState.workspace.visibility = "private";

    render(
      <MemoryRouter>
        <WorkspaceSettingsPanel />
      </MemoryRouter>,
    );

    expect(
      screen.getByTestId("workspace-settings-name").hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByTestId("workspace-settings-visibility").hasAttribute("disabled"),
    ).toBe(true);
  });

  it("keeps private owner changes behind organization permission", () => {
    testState.canUpdate = false;
    testState.workspace.owner_id = testState.userId;
    testState.workspace.visibility = "private";

    render(
      <MemoryRouter>
        <WorkspaceSettingsPanel />
      </MemoryRouter>,
    );

    expect(
      screen.getByTestId("workspace-settings-name").hasAttribute("disabled"),
    ).toBe(true);
  });

  it("deletes after explicit confirmation", async () => {
    render(
      <MemoryRouter initialEntries={["/acme/atlas/settings"]}>
        <WorkspaceSettingsPanel />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("workspace-settings-delete"));
    fireEvent.click(screen.getByTestId("confirm-workspace-delete"));

    await waitFor(() => {
      expect(removeWorkspace).toHaveBeenCalledWith({
        db: { id: "db" },
        id: "workspace_1",
      });
    });
  });
});
