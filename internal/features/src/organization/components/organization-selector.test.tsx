/** @vitest-environment happy-dom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth";
import { markPendingOrganization } from "../pending-organization";
import { OrganizationSelector } from "./organization-selector";

const { useOrganizationsQuery, useOrganizationDeveloperMode } = vi.hoisted(() => ({
  useOrganizationDeveloperMode: vi.fn(),
  useOrganizationsQuery: vi.fn(),
}));

vi.mock("@repo/data/features/organizations", () => ({
  useOrganizationsQuery,
  useOrganizationMemberRoleQuery: () => ({ data: "owner" }),
}));

vi.mock("../use-organization-developer-mode", () => ({
  useOrganizationDeveloperMode,
}));

vi.mock("../../region", () => ({
  useRegion: () => ({
    pathWithRegion: (path: string) =>
      path.includes("?") ? `${path}&region=us` : `${path}?region=us`,
  }),
}));

vi.mock("./create-organization-dialog", () => ({
  CreateOrganizationDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="organization-create-dialog" /> : null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "workspaces.switchOrganization": "Switch organization",
        "organization.createOrganization": "Create new",
        "organization.settings": "Organization Settings",
        "organization.signUpToCreateOrganizations": "Sign up to create organizations",
      })[key] ?? key,
  }),
}));

const activeOrg = {
  id: "org_1",
  name: "Northstar Studio",
  slug: "northstar",
};

const otherOrg = {
  id: "org_2",
  name: "Paper Lantern",
  slug: "paper-lantern",
};

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderSelector({
  anonymous = false,
  activeOrganization = activeOrg as typeof activeOrg & { deletionRequestedAt?: string },
  client = new QueryClient(),
  setActive = vi.fn().mockResolvedValue({ data: activeOrg, error: null }),
} = {}) {
  render(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={["/northstar?region=us"]}>
      <AuthProvider
        client={
          {
            organization: { setActive },
            useActiveOrganization: () => ({ data: activeOrganization }),
            useSession: () => ({
              data: { user: { isAnonymous: anonymous } },
            }),
          } as never
        }
      >
        <OrganizationSelector />
        <LocationDisplay />
      </AuthProvider>
    </MemoryRouter></QueryClientProvider>
  );

  return { setActive };
}

describe("OrganizationSelector", () => {
  it("warms developer mode for an organization owner", () => {
    renderSelector();
    expect(useOrganizationDeveloperMode).toHaveBeenCalledWith("org_1", true);
  });

  it("does not warm developer mode for anonymous users", () => {
    renderSelector({ anonymous: true });
    expect(useOrganizationDeveloperMode).toHaveBeenCalledWith("org_1", false);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useOrganizationsQuery.mockReturnValue({
      data: [activeOrg, otherOrg],
      error: null,
      isFetching: false,
      isLoading: false,
    });
    window.history.replaceState(null, "", "/northstar?region=us");
  });

  it("hides suspended organizations while keeping active choices", async () => {
    useOrganizationsQuery.mockReturnValue({
      data: [activeOrg, { ...otherOrg, deletion_purge_after: "2026-10-01" }],
      isLoading: false,
    });
    renderSelector();
    await userEvent.click(screen.getByTestId("organization-selector-trigger"));
    expect(screen.queryByRole("menuitemradio", { name: "Paper Lantern" })).toBeNull();
    expect(screen.getByRole("menuitemradio", { name: "Northstar Studio" })).toBeTruthy();
  });

  it("hides deletion immediately before directory sync", async () => {
    const client = new QueryClient();
    client.setQueryData(["organization-deletion", otherOrg.id], { status: "scheduled" });
    renderSelector({ client });
    await userEvent.click(screen.getByTestId("organization-selector-trigger"));
    expect(screen.queryByRole("menuitemradio", { name: "Paper Lantern" })).toBeNull();
  });

  it("shows restored organizations despite stale auth suspension data", async () => {
    renderSelector({ activeOrganization: { ...activeOrg, deletionRequestedAt: "2026-09-01" } });
    await userEvent.click(screen.getByTestId("organization-selector-trigger"));
    expect(screen.getByRole("menuitemradio", { name: "Northstar Studio" })).toBeTruthy();
    expect(screen.getByTestId("organization-settings-trigger").getAttribute("aria-disabled")).not.toBe("true");
  });

  it("shows active organization and all organization choices", async () => {
    const user = userEvent.setup();
    renderSelector();

    expect(screen.getByTestId("organization-selector-trigger").textContent).toContain(
      "Northstar Studio"
    );
    expect(screen.getByTestId("organization-selector-avatar").textContent).toBe(
      "NS"
    );

    await user.click(screen.getByTestId("organization-selector-trigger"));

    expect(
      screen
        .getByRole("menuitemradio", { name: "Northstar Studio" })
        .getAttribute("aria-checked")
    ).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: "Paper Lantern" })).toBeTruthy();
  });

  it("routes to another organization for scoped activation", async () => {
    const user = userEvent.setup();
    const { setActive } = renderSelector();

    await user.click(screen.getByTestId("organization-selector-trigger"));
    await user.click(screen.getByRole("menuitemradio", { name: "Paper Lantern" }));

    await waitFor(() => {
      expect(setActive).not.toHaveBeenCalled();
      expect(screen.getByTestId("location").textContent).toBe(
        "/paper-lantern?region=us"
      );
    });
  });

  it("does not route when the active organization is selected", async () => {
    const user = userEvent.setup();
    const { setActive } = renderSelector();

    await user.click(screen.getByTestId("organization-selector-trigger"));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Northstar Studio" }),
    );

    expect(setActive).not.toHaveBeenCalled();
    expect(screen.getByTestId("location").textContent).toBe(
      "/northstar?region=us"
    );
  });

  it("opens organization creation for registered users", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByTestId("organization-selector-trigger"));
    await user.click(screen.getByTestId("organization-create-trigger"));

    expect(screen.getByTestId("organization-create-dialog")).toBeTruthy();
  });

  it("sends anonymous users to registration with return URL", async () => {
    const user = userEvent.setup();
    renderSelector({ anonymous: true });

    await user.click(screen.getByTestId("organization-selector-trigger"));
    await user.click(screen.getByTestId("organization-create-trigger"));

    const location = screen.getByTestId("location").textContent ?? "";
    expect(location).toContain("/auth/register?region=us");
    expect(location).toContain("redirectTo=");
  });

  it("opens active organization settings from the switcher menu", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByTestId("organization-selector-trigger"));
    await user.click(screen.getByTestId("organization-settings-trigger"));

    expect(screen.getByTestId("location").textContent).toBe(
      "/northstar/settings"
    );
  });

  it("falls back to active organization before directory sync", async () => {
    useOrganizationsQuery.mockReturnValue({
      data: [],
      error: null,
      isFetching: true,
      isLoading: true,
    });
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByTestId("organization-selector-trigger"));

    expect(
      screen.getByRole("menuitemradio", { name: "Northstar Studio" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("menuitemradio", { name: "Paper Lantern" }),
    ).toBeNull();
  });

  it("keeps a newly created organization available while its directory row syncs", async () => {
    useOrganizationsQuery.mockReturnValue({
      data: [activeOrg],
      error: null,
      isFetching: false,
      isLoading: false,
    });
    markPendingOrganization({
      id: otherOrg.id,
      name: otherOrg.name,
      slug: otherOrg.slug,
    });
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByTestId("organization-selector-trigger"));

    expect(
      screen.getByRole("menuitemradio", { name: "Paper Lantern" }),
    ).toBeTruthy();
  });

  it("uses a pending rename before the active directory row syncs", async () => {
    markPendingOrganization({
      id: activeOrg.id,
      name: "Renamed Studio",
      slug: "renamed-studio",
    });
    const user = userEvent.setup();
    renderSelector();

    expect(screen.getByTestId("organization-selector-trigger").textContent).toContain(
      "Renamed Studio"
    );
    await user.click(screen.getByTestId("organization-selector-trigger"));
    expect(
      screen.getByRole("menuitemradio", { name: "Renamed Studio" }),
    ).toBeTruthy();

    await user.click(screen.getByTestId("organization-settings-trigger"));
    expect(screen.getByTestId("location").textContent).toBe(
      "/renamed-studio/settings"
    );
  });

  it("switches to a pending slug before another directory row syncs", async () => {
    markPendingOrganization({
      id: otherOrg.id,
      name: "Renamed Lantern",
      slug: "renamed-lantern",
    });
    const user = userEvent.setup();
    const { setActive } = renderSelector();

    await user.click(screen.getByTestId("organization-selector-trigger"));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Renamed Lantern" }),
    );

    await waitFor(() => {
      expect(setActive).not.toHaveBeenCalled();
      expect(screen.getByTestId("location").textContent).toBe(
        "/renamed-lantern?region=us"
      );
    });
  });

  it("drops cached active organization after membership removal syncs", async () => {
    useOrganizationsQuery.mockReturnValue({
      data: [otherOrg],
      error: null,
      isFetching: false,
      isLoading: false,
    });
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByTestId("organization-selector-trigger"));

    expect(
      screen.queryByRole("menuitemradio", { name: "Northstar Studio" }),
    ).toBeNull();
    expect(
      screen.getByRole("menuitemradio", { name: "Paper Lantern" }),
    ).toBeTruthy();
  });
});
