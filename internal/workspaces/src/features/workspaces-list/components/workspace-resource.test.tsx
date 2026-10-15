/** @vitest-environment happy-dom */

import { PermissionProvider } from "@repo/features/permissions";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceResource } from "./workspace-resource";

vi.mock("@repo/data/core", () => ({
  usePowerSync: vi.fn(() => ({})),
}));

vi.mock("@repo/data/features/workspaces", () => ({
  removeWorkspace: vi.fn(),
}));

vi.mock("@repo/workspaces/search", () => ({
  clearRecentFilesForWorkspace: vi.fn(),
}));

vi.mock("@repo/features/region", () => ({
  useRegion: () => ({ pathWithRegion: (path: string) => path }),
}));

vi.mock("@repo/features/auth/context", () => ({
  useAuth: () => ({
    useSession: () => ({ data: { user: { id: "user_1" } } }),
  }),
}));

vi.mock("@lunarisapp/ui/blocks/input-confirmation-dialog", () => ({
  InputConfirmationDialog: () => null,
}));

vi.mock("./workspace-options-menu", () => ({
  WorkspaceOptionsMenu: ({
    canDelete,
    onSettings,
    workspaceName,
  }: {
    canDelete: boolean;
    onSettings: () => void;
    workspaceName: string;
  }) => (
    <button
      aria-label={`Actions: ${workspaceName}`}
      data-can-delete={String(canDelete)}
      data-testid="workspace-options"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSettings();
      }}
      type="button"
    />
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const workspace = {
  created_at: "2026-01-01T00:00:00.000Z",
  id: "workspace_1",
  name: "Atlas",
  organization_id: "org_1",
  owner_id: null,
  slug: "atlas",
  updated_at: null,
  visibility: "shared" as const,
};

function CurrentPath() {
  return <span data-testid="current-path">{useLocation().pathname}</span>;
}

describe("WorkspaceResource", () => {
  it("activates sync only for focus and pointer down", () => {
    const onWorkspaceIntent = vi.fn();
    render(
      <MemoryRouter>
        <WorkspaceResource
          onWorkspaceIntent={onWorkspaceIntent}
          workspace={workspace}
          organizationSlug="acme"
        />
      </MemoryRouter>
    );
    const item = screen.getByTestId("workspaces-list-item-atlas");

    fireEvent.pointerEnter(item);
    expect(onWorkspaceIntent).not.toHaveBeenCalled();

    fireEvent.focus(item);
    expect(onWorkspaceIntent).toHaveBeenLastCalledWith(workspace);

    fireEvent.pointerDown(item);
    expect(onWorkspaceIntent).toHaveBeenLastCalledWith(workspace);
  });

  it("keeps workspace actions outside the workspace link", () => {
    render(
      <MemoryRouter>
        <WorkspaceResource workspace={workspace} organizationSlug="acme" />
      </MemoryRouter>,
    );

    const item = screen.getByTestId("workspaces-list-item-atlas");
    const options = screen.getByTestId("workspace-options");

    expect(item.contains(options)).toBe(false);
    expect(options.getAttribute("aria-label")).toBe("Actions: Atlas");
  });

  it.each(["grid", "list"] as const)(
    "exposes %s resources as list items",
    (view) => {
      render(
        <MemoryRouter>
          <WorkspaceResource
            organizationSlug="acme"
            view={view}
            workspace={workspace}
          />
        </MemoryRouter>,
      );

      expect(screen.getByRole("listitem")).toBeTruthy();
    },
  );

  it("shows workspace initials in the avatar", () => {
    const { container } = render(
      <MemoryRouter>
        <WorkspaceResource
          workspace={{ ...workspace, name: "Atlas Research" }}
          organizationSlug="acme"
        />
      </MemoryRouter>,
    );

    expect(
      container.querySelector('[data-slot="avatar-fallback"]')?.textContent,
    ).toBe("AR");
  });

  it("labels list activity timestamps", () => {
    render(
      <MemoryRouter>
        <WorkspaceResource
          workspace={{ ...workspace, updated_at: "2026-01-01T00:00:00.000Z", last_activity_at: "2026-01-02T00:00:00.000Z" }}
          view="list"
          organizationSlug="acme"
        />
      </MemoryRouter>,
    );

    const timestamps = screen.getAllByLabelText(/^workspaces.updated /);
    expect(timestamps).toHaveLength(2);
    expect(timestamps[0]?.getAttribute("datetime")).toBe(
      "2026-01-02T00:00:00.000Z",
    );
  });

  it("keeps settings available without mutation access", () => {
    render(
      <PermissionProvider check={() => false}>
        <MemoryRouter>
          <WorkspaceResource workspace={workspace} organizationSlug="acme" />
        </MemoryRouter>
      </PermissionProvider>
    );

    expect(screen.getByTestId("workspace-options").dataset.canDelete).toBe("false");
  });

  it("opens workspace settings at the canonical settings slug", () => {
    render(
      <MemoryRouter>
        <WorkspaceResource workspace={workspace} organizationSlug="acme" />
        <CurrentPath />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId("workspace-options"));

    expect(screen.getByTestId("current-path").textContent).toBe(
      "/acme/atlas/settings"
    );
  });

  it("requires content delete access to delete a workspace", () => {
    render(
      <PermissionProvider
        check={({ action, resource }) =>
          !(resource === "content" && action === "delete")
        }
      >
        <MemoryRouter>
          <WorkspaceResource workspace={workspace} organizationSlug="acme" />
        </MemoryRouter>
      </PermissionProvider>,
    );

    const options = screen.getByTestId("workspace-options");
    expect(options.dataset.canDelete).toBe("false");
  });

  it("lets private workspace owner delete it", () => {
    render(
      <MemoryRouter>
        <WorkspaceResource
          workspace={{
            ...workspace,
            owner_id: "user_1",
            visibility: "private",
          }}
          organizationSlug="acme"
        />
      </MemoryRouter>,
    );

    const options = screen.getByTestId("workspace-options");
    expect(options.dataset.canDelete).toBe("true");
  });
});
