/** @vitest-environment happy-dom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTrashPanel } from "./workspace-trash-panel";

const { purgeResources, restoreResources, state } = vi.hoisted(() => ({
  purgeResources: vi.fn(() => Promise.resolve()),
  restoreResources: vi.fn(() => Promise.resolve()),
  state: {
    canMutate: true,
    roots: [] as Record<string, unknown>[],
  },
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({ useResourceTypes: () => [] }));
vi.mock("@repo/data/features/workspace-resources", () => ({
  useWorkspaceResourceTrashRootsQuery: () => ({ data: state.roots }),
}));
vi.mock("@repo/features/permissions", () => ({
  usePermission: () => state.canMutate,
}));
vi.mock("../../workspace", () => ({
  useCurrentWorkspace: () => ({ workspaceId: "workspace_1" }),
}));
vi.mock("../store", () => ({
  useWorkspaceActions: () => ({ purgeResources, restoreResources }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) => key,
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@lunarisapp/ui/blocks/confirmation-dialog", () => ({
  ConfirmationDialog: ({
    onConfirm,
    open,
  }: {
    onConfirm: () => void;
    open: boolean;
  }) => (open ? <button onClick={onConfirm}>confirm-purge</button> : null),
}));

const root = {
  created_at: "2026-09-01T10:00:00.000Z",
  descendant_count: 2,
  icon: null,
  id: "folder_1",
  name: "Drafts",
  parent_id: null,
  position: 0,
  workspace_id: "workspace_1",
  purge_at: "2026-10-01T10:00:00.000Z",
  resource_type_id: "lunaris.folder",
  schema_version: 1,
  trash_root_id: "folder_1",
  trashed_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};

describe("WorkspaceTrashPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    vi.clearAllMocks();
    state.canMutate = true;
    state.roots = [root];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects and restores trash roots", async () => {
    render(<WorkspaceTrashPanel />);

    fireEvent.click(screen.getByRole("checkbox", { name: "trash.selectAll" }));
    fireEvent.click(screen.getByRole("button", { name: "trash.restore" }));

    await waitFor(() =>
      expect(restoreResources).toHaveBeenCalledWith(["folder_1"])
    );
  });

  it("requires confirmation before permanently deleting", async () => {
    render(<WorkspaceTrashPanel />);

    fireEvent.click(screen.getByRole("checkbox", { name: "trash.selectAll" }));
    fireEvent.click(screen.getByRole("button", { name: "trash.deleteNow" }));
    expect(purgeResources).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "confirm-purge" }));

    await waitFor(() =>
      expect(purgeResources).toHaveBeenCalledWith(["folder_1"])
    );
  });

  it("shows its empty state", () => {
    state.roots = [];
    render(<WorkspaceTrashPanel />);
    expect(screen.getByText("trash.emptyTitle")).toBeTruthy();
  });

  it("does not restore roots after their deadline", () => {
    state.roots = [{ ...root, purge_at: "2000-01-01T00:00:00.000Z" }];
    render(<WorkspaceTrashPanel />);

    fireEvent.click(screen.getByRole("checkbox", { name: "trash.selectAll" }));

    expect(
      (
        screen.getByRole("button", {
          name: "trash.restore",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
});
