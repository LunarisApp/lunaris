/** @vitest-environment happy-dom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { TeamsSection } from "./teams-section";

const {
  auth,
  useOrganizationMembersQuery,
  useOrganizationTeamMembershipsQuery,
  useOrganizationTeamsQuery,
} = vi.hoisted(() => ({
  auth: {
    organization: {
      addTeamMember: vi.fn(),
      createTeam: vi.fn(),
      removeTeam: vi.fn(),
      removeTeamMember: vi.fn(),
      setActiveTeam: vi.fn(),
      updateTeam: vi.fn(),
    },
    useActiveOrganization: vi.fn(),
    useSession: vi.fn(),
  },
  useOrganizationMembersQuery: vi.fn(),
  useOrganizationTeamMembershipsQuery: vi.fn(),
  useOrganizationTeamsQuery: vi.fn(),
}));

vi.mock("@repo/data/features/organizations", () => ({ useOrganizationMembersQuery }));

vi.mock("./queries", () => ({
  useOrganizationTeamMembershipsQuery,
  useOrganizationTeamsQuery,
}));

vi.mock("@repo/platform", () => ({ useOnlineStatus: () => true }));

vi.mock("@repo/features/auth", () => ({
  UserAvatar: () => null,
  useAuth: () => auth,
}));

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamsSection />
    </QueryClientProvider>,
  );
}

describe("TeamsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.useSession.mockReturnValue({
      data: { session: { activeTeamId: null }, user: { id: "user-1" } },
    });
    auth.useActiveOrganization.mockReturnValue({
      data: { id: "organization-1", isPersonal: false },
    });
    useOrganizationMembersQuery.mockReturnValue({
      data: [
        {
          id: "member-1",
          role: "owner",
          user: { email: "owner@example.com", id: "user-1", name: "Owner" },
        },
        {
          id: "member-2",
          role: "editor",
          user: {
            email: "editor@example.com",
            id: "user-2",
            name: "Editor",
          },
        },
      ],
      isLoading: false,
    });
    useOrganizationTeamsQuery.mockReturnValue({
      data: [
        {
          createdAt: "2026-08-27T00:00:00.000Z",
          id: "team-1",
          name: "Editorial",
          organizationId: "organization-1",
        },
      ],
      isLoading: false,
    });
    useOrganizationTeamMembershipsQuery.mockReturnValue({
      data: [
        {
          createdAt: "2026-08-27T00:00:00.000Z",
          id: "team-member-1",
          teamId: "team-1",
          userId: "user-1",
        },
      ],
      isLoading: false,
    });
    auth.organization.addTeamMember.mockResolvedValue({
      data: { id: "team-member-2" },
      error: null,
    });
    auth.organization.removeTeam.mockResolvedValue({
      data: { message: "Team removed successfully." },
      error: null,
    });
    auth.organization.setActiveTeam.mockResolvedValue({
      data: null,
      error: null,
    });
  });

  it("creates a trimmed team", async () => {
    auth.organization.createTeam.mockResolvedValue({
      data: {
        createdAt: "2026-08-27T00:00:00.000Z",
        id: "team-2",
        name: "Design",
        organizationId: "organization-1",
      },
      error: null,
    });
    renderSection();

    const teamButton = screen.getByRole("button", {
      name: "organization.teams.openDetails",
    });
    const memberDescriptionId = teamButton.getAttribute("aria-describedby");
    expect(memberDescriptionId).toBeTruthy();
    expect(
      document.getElementById(memberDescriptionId ?? "")?.textContent,
    ).toContain("1");

    fireEvent.click(
      screen.getByRole("button", { name: "organization.teams.createButton" }),
    );
    fireEvent.change(await screen.findByTestId("organization-team-name"), {
      target: { value: "  Design  " },
    });
    fireEvent.click(screen.getByTestId("organization-team-create"));

    await waitFor(() => {
      expect(auth.organization.createTeam).toHaveBeenCalledWith({
        name: "Design",
        organizationId: "organization-1",
      });
    });
  });

  it("creates a team by pressing Enter in the name field", async () => {
    const user = userEvent.setup();
    auth.organization.createTeam.mockResolvedValue({
      data: {
        createdAt: "2026-08-27T00:00:00.000Z",
        id: "team-2",
        name: "Design",
        organizationId: "organization-1",
      },
      error: null,
    });
    renderSection();

    await user.click(
      screen.getByRole("button", { name: "organization.teams.createButton" }),
    );
    await user.type(
      await screen.findByTestId("organization-team-name"),
      "Design{enter}",
    );

    await waitFor(() => {
      expect(auth.organization.createTeam).toHaveBeenCalledWith({
        name: "Design",
        organizationId: "organization-1",
      });
    });
  });

  it("adds an existing organization member to a team", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(
      screen.getByRole("button", { name: "organization.teams.openDetails" }),
    );
    await user.type(
      await screen.findByRole("searchbox", {
        name: "organization.teams.searchMembers",
      }),
      "Editor",
    );
    const addButton = screen.getByRole("button", {
      name: "organization.teams.addMember",
    });
    expect(addButton.textContent).toBe("organization.teams.add");
    await user.click(addButton);

    await waitFor(() => {
      expect(auth.organization.addTeamMember).toHaveBeenCalledWith({
        organizationId: "organization-1",
        teamId: "team-1",
        userId: "user-2",
      });
    });
  });

  it("removes a team member and reports success", async () => {
    const user = userEvent.setup();
    auth.organization.removeTeamMember.mockResolvedValue({ data: {}, error: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: "organization.teams.openDetails" }));
    await user.click(await screen.findByRole("button", { name: "organization.teams.removeMember" }));

    await waitFor(() => {
      expect(auth.organization.removeTeamMember).toHaveBeenCalledWith({
        organizationId: "organization-1",
        teamId: "team-1",
        userId: "user-1",
      });
      expect(toast.success).toHaveBeenCalledWith("organization.teams.memberRemoved");
    });
    expect(auth.organization.addTeamMember).not.toHaveBeenCalled();
  });

  it("preserves the active team when deleting another team", async () => {
    const user = userEvent.setup();
    auth.useSession.mockReturnValue({
      data: { session: { activeTeamId: "team-2" }, user: { id: "user-1" } },
    });
    useOrganizationTeamsQuery.mockReturnValue({
      data: [
        {
          createdAt: "2026-08-27T00:00:00.000Z",
          id: "team-1",
          name: "Editorial",
          organizationId: "organization-1",
        },
        {
          createdAt: "2026-08-27T00:00:00.000Z",
          id: "team-2",
          name: "Design",
          organizationId: "organization-1",
        },
      ],
      isLoading: false,
    });
    renderSection();

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "organization.teams.openDetails",
        })
      )[0]!,
    );
    await user.click(
      await screen.findByRole("button", {
        name: "organization.teams.delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "organization.teams.delete" }),
    );

    await waitFor(() => {
      expect(auth.organization.removeTeam).toHaveBeenCalledWith({
        organizationId: "organization-1",
        teamId: "team-1",
      });
    });
    expect(auth.organization.setActiveTeam).not.toHaveBeenCalled();
  });

  it("clears the active team before deleting it", async () => {
    const user = userEvent.setup();
    auth.useSession.mockReturnValue({
      data: { session: { activeTeamId: "team-1" }, user: { id: "user-1" } },
    });
    useOrganizationTeamsQuery.mockReturnValue({
      data: [
        {
          createdAt: "2026-08-27T00:00:00.000Z",
          id: "team-1",
          name: "Editorial",
          organizationId: "organization-1",
        },
        {
          createdAt: "2026-08-27T00:00:00.000Z",
          id: "team-2",
          name: "Design",
          organizationId: "organization-1",
        },
      ],
      isLoading: false,
    });
    renderSection();

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "organization.teams.openDetails",
        })
      )[0]!,
    );
    await user.click(
      await screen.findByRole("button", {
        name: "organization.teams.delete",
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "organization.teams.delete" }),
    );

    await waitFor(() => {
      expect(auth.organization.setActiveTeam).toHaveBeenCalledWith({
        teamId: null,
      });
      expect(auth.organization.removeTeam).toHaveBeenCalledWith({
        organizationId: "organization-1",
        teamId: "team-1",
      });
    });
    expect(
      auth.organization.setActiveTeam.mock.invocationCallOrder[0],
    ).toBeLessThan(auth.organization.removeTeam.mock.invocationCallOrder[0]!);
  });
});
