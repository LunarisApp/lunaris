/** @vitest-environment happy-dom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSharingSettings } from "./workspace-sharing-settings";

const { api, capture, refetch, toast } = vi.hoisted(() => ({
  api: {
    delete: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve()),
    patch: vi.fn(() => Promise.resolve()),
    post: vi.fn(() => Promise.resolve()),
  },
  capture: vi.fn(),
  refetch: vi.fn(() => Promise.resolve()),
  toast: { error: vi.fn(), success: vi.fn() },
}));

const member = {
  id: "member_1",
  workspaceId: "workspace/1",
  role: "viewer",
  user: { email: "member@example.com", id: "user_2", name: "Member" },
};

vi.mock("@repo/features/api", () => ({
  useApi: () => api,
}));

vi.mock("@repo/data/features/organizations", () => ({
  useOrganizationMembersQuery: () => ({
    data: [
      { id: "organization_owner", user: { id: "user_1" } },
      { id: "organization_granted", user: { id: "user_2" } },
      { id: "organization_candidate", user: { id: "user_3" } },
    ],
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { items: [member] },
    isLoading: false,
    refetch,
  }),
}));

vi.mock("./workspace-sharing-controls", () => ({
  WorkspaceAccessGrantForm: ({
    candidates,
    onAdd,
    onRoleChange,
    onUserChange,
  }: {
    candidates: Array<{ user: { id: string } }>;
    onAdd: () => void;
    onRoleChange: (role: string) => void;
    onUserChange: (userId: string) => void;
  }) => (
    <div data-testid="grant-form">
      <span data-testid="candidate-ids">
        {candidates.map((item) => item.user.id).join(",")}
      </span>
      <button onClick={() => onUserChange("user_3")}>select candidate</button>
      <button onClick={() => onRoleChange("editor")}>select editor</button>
      <button onClick={onAdd}>grant</button>
    </div>
  ),
  WorkspaceMemberList: ({
    members,
    onRemove,
    onRoleChange,
    onTransfer,
  }: {
    members: Array<{ id: string; user: { id: string } }>;
    onRemove: (memberId: string) => void;
    onRoleChange: (memberId: string, role: string) => void;
    onTransfer: (userId: string) => void;
  }) => (
    <div data-testid="member-list">
      <button onClick={() => onRoleChange(members[0]?.id ?? "", "editor")}>
        update role
      </button>
      <button onClick={() => onRemove(members[0]?.id ?? "")}>remove</button>
      <button onClick={() => onTransfer(members[0]?.user.id ?? "")}>
        transfer
      </button>
    </div>
  ),
}));

vi.mock("@repo/data/http", () => ({
  getUserFacingDescription: () => "error description",
  getUserFacingError: () => ({ titleKey: "error" }),
}));

vi.mock("posthog-js", () => ({ default: { capture } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({ toast }));

describe("WorkspaceSharingSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters granted users and grants access", async () => {
    render(
      <WorkspaceSharingSettings
        organizationId="org_1"
        ownerId="user_1"
        workspaceId="workspace/1"
      />,
    );

    expect(screen.getByTestId("candidate-ids").textContent).toBe("user_3");
    fireEvent.click(screen.getByRole("button", { name: "select candidate" }));
    fireEvent.click(screen.getByRole("button", { name: "select editor" }));
    fireEvent.click(screen.getByRole("button", { name: "grant" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/v1/workspaces/workspace%2F1/members", {
        body: { role: "editor", userId: "user_3" },
      });
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith("workspace_member_granted", {
      role: "editor",
    });
  });

  it("updates, removes, and transfers member access", async () => {
    render(
      <WorkspaceSharingSettings
        organizationId="org_1"
        ownerId="user_1"
        workspaceId="workspace/1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "update role" }));
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/v1/workspaces/workspace%2F1/members/member_1",
        { body: { role: "editor" } },
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "remove" }));
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(
        "/v1/workspaces/workspace%2F1/members/member_1",
      );
    });

    refetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "transfer" }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/v1/workspaces/workspace%2F1/transfer", {
        body: { userId: "user_2" },
      });
    });
    expect(refetch).not.toHaveBeenCalled();
  });

  it("reports mutation failures without refetching", async () => {
    api.post.mockRejectedValueOnce(new Error("offline"));
    render(
      <WorkspaceSharingSettings
        organizationId="org_1"
        ownerId="user_1"
        workspaceId="workspace/1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "select candidate" }));
    fireEvent.click(screen.getByRole("button", { name: "grant" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("error", {
        description: "error description",
      });
    });
    expect(refetch).not.toHaveBeenCalled();
  });
});
