/** @vitest-environment happy-dom */

import { UNLIMITED } from "@repo/auth/entitlements";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@repo/features/permissions";
import { markPendingOrganization } from "@repo/features/organization/pending-organization";
import { MembersSection } from "./members-section";

const {
  auth,
  useLimit,
  useOrganizationMembersQuery,
  useOrganizationTeamsQuery,
} = vi.hoisted(() => ({
  auth: {
    organization: {
      inviteMember: vi.fn(),
      listInvitations: vi.fn(),
      listMembers: vi.fn(),
    },
    useActiveOrganization: vi.fn(),
    useSession: vi.fn(),
  },
  useLimit: vi.fn(),
  useOrganizationMembersQuery: vi.fn(),
  useOrganizationTeamsQuery: vi.fn(),
}));

vi.mock("@repo/data/features/organizations", () => ({
  useOrganizationMembersQuery,
}));

vi.mock("./queries", () => ({
  useOrganizationTeamsQuery,
}));

vi.mock("@repo/features/auth", () => ({
  UserAvatar: () => null,
  useAuth: () => auth,
}));

vi.mock("@repo/features/entitlements", () => ({ useLimit }));

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "organization.memberCapacityUnlimited"
        ? "Unlimited member capacity. Pending invitations are not billed until accepted."
        : key,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("MembersSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useLimit.mockReturnValue(UNLIMITED);
    auth.useSession.mockReturnValue({ data: { user: { id: "user-1" } } });
    auth.useActiveOrganization.mockReturnValue({
      data: { id: "organization-1", isPersonal: false },
    });
    useOrganizationMembersQuery.mockReturnValue({
      data: [
        {
          createdAt: "2026-07-27T00:00:00.000Z",
          id: "member-1",
          organizationId: "organization-1",
          role: "owner",
          user: {
            email: "owner@example.com",
            id: "user-1",
            image: null,
            name: "Owner",
          },
        },
      ],
      isLoading: false,
    });
    auth.organization.listInvitations.mockResolvedValue({
      data: [],
      error: null,
    });
    useOrganizationTeamsQuery.mockReturnValue({ data: [], isLoading: false });
  });

  it("describes unlimited capacity without exposing its numeric sentinel", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MembersSection />
      </QueryClientProvider>
    );

    expect(
      await screen.findByText(
        "Unlimited member capacity. Pending invitations are not billed until accepted."
      )
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain(String(UNLIMITED));
  });

  it("does not offer authentication autofill for invitation emails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MembersSection />
      </QueryClientProvider>
    );

    const email = await screen.findByTestId("organization-invite-email");
    expect(email.getAttribute("autocomplete")).toBe("off");
    expect(email.hasAttribute("required")).toBe(true);
    expect(email.closest("form")).not.toBeNull();
    expect(
      document.getElementById(email.getAttribute("aria-describedby") ?? "")
    ).not.toBeNull();
  });

  it("submits a trimmed viewer invitation", async () => {
    auth.organization.inviteMember.mockResolvedValue({
      data: {
        createdAt: "2026-07-27T00:00:00.000Z",
        email: "member@example.com",
        expiresAt: "2026-08-03T00:00:00.000Z",
        id: "invitation-1",
        role: "viewer",
        status: "pending",
      },
      error: null,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MembersSection />
      </QueryClientProvider>
    );

    const emailInput = await screen.findByTestId("organization-invite-email");
    fireEvent.change(emailInput, {
      target: { value: "  member@example.com  " },
    });
    fireEvent.click(screen.getByTestId("organization-invite-submit"));

    await waitFor(() => {
      expect(auth.organization.inviteMember).toHaveBeenCalledWith({
        email: "member@example.com",
        organizationId: "organization-1",
        role: "viewer",
      });
    });
    expect((emailInput as HTMLInputElement).value).toBe("");
  });

  it("submits an invitation with Enter", async () => {
    auth.organization.inviteMember.mockResolvedValue({
      data: {
        createdAt: "2026-07-27T00:00:00.000Z",
        email: "keyboard@example.com",
        expiresAt: "2026-08-03T00:00:00.000Z",
        id: "invitation-1",
        role: "viewer",
        status: "pending",
      },
      error: null,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MembersSection />
      </QueryClientProvider>
    );

    const user = userEvent.setup();
    await user.type(
      await screen.findByTestId("organization-invite-email"),
      "keyboard@example.com{Enter}"
    );

    await waitFor(() => {
      expect(auth.organization.inviteMember).toHaveBeenCalledWith({
        email: "keyboard@example.com",
        organizationId: "organization-1",
        role: "viewer",
      });
    });
  });

  it("can invite a member directly into a team", async () => {
    const user = userEvent.setup();
    useOrganizationTeamsQuery.mockReturnValue({
      data: [
        {
          createdAt: "2026-08-27T00:00:00.000Z",
          id: "team-1",
          name: "Editorial",
          organizationId: "organization-1",
          updatedAt: null,
        },
      ],
      isLoading: false,
    });
    auth.organization.inviteMember.mockResolvedValue({
      data: { id: "invitation-1" },
      error: null,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MembersSection />
      </QueryClientProvider>
    );

    await user.click(await screen.findByTestId("organization-invite-team"));
    await user.click(await screen.findByRole("option", { name: "Editorial" }));
    fireEvent.change(screen.getByTestId("organization-invite-email"), {
      target: { value: "editor@example.com" },
    });
    fireEvent.click(screen.getByTestId("organization-invite-submit"));

    await waitFor(() => {
      expect(auth.organization.inviteMember).toHaveBeenCalledWith({
        email: "editor@example.com",
        organizationId: "organization-1",
        role: "viewer",
        teamId: "team-1",
      });
    });
  });

  it("contains invitation failures within the members section", async () => {
    auth.organization.listInvitations.mockRejectedValue(
      new TypeError("offline")
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MembersSection />
      </QueryClientProvider>
    );

    expect(
      await screen.findByText("organization.invitationsUnavailableTitle")
    ).toBeTruthy();
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    expect(screen.getByTestId("organization-invite-email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "common.retry" })).toBeTruthy();
  });

  it("allows invitation creation without invitation read access", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <PermissionProvider
        check={({ action, resource }) =>
          !(resource === "invitation" && action === "read")
        }
      >
        <QueryClientProvider client={queryClient}>
          <MembersSection />
        </QueryClientProvider>
      </PermissionProvider>
    );

    expect(await screen.findByTestId("organization-invite-email")).toBeTruthy();
    expect(auth.organization.listInvitations).not.toHaveBeenCalled();
  });

  it("keeps owner controls available while a new membership row syncs", async () => {
    useOrganizationMembersQuery.mockReturnValue({
      data: [],
      isLoading: false,
    });
    markPendingOrganization({
      id: "organization-1",
      name: "New Organization",
      slug: "new-organization",
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MembersSection />
      </QueryClientProvider>
    );

    expect(
      (await screen.findByTestId("organization-invite-email")).hasAttribute(
        "disabled"
      )
    ).toBe(false);
  });

  it("does not upgrade a synced viewer from a pending marker", async () => {
    useOrganizationMembersQuery.mockReturnValue({
      data: [
        {
          createdAt: "2026-07-27T00:00:00.000Z",
          id: "member-1",
          organizationId: "organization-1",
          role: "viewer",
          user: {
            email: "viewer@example.com",
            id: "user-1",
            image: null,
            name: "Viewer",
          },
        },
      ],
      isLoading: false,
    });
    markPendingOrganization({
      id: "organization-1",
      name: "Renamed Organization",
      slug: "renamed-organization",
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MembersSection />
      </QueryClientProvider>
    );

    expect(await screen.findByText("permissions.readOnlyTitle")).toBeTruthy();
    expect(screen.queryByTestId("organization-invite-email")).toBeNull();
  });

  it("keeps the invite form mounted during transient organization refetches", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MembersSection />
      </QueryClientProvider>
    );
    const input = await screen.findByTestId("organization-invite-email");

    auth.useActiveOrganization.mockReturnValue({ data: null });
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <MembersSection />
      </QueryClientProvider>
    );
    fireEvent.change(input, { target: { value: "member@example.com" } });

    expect(screen.getByTestId("organization-invite-email")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("member@example.com");
  });
});
