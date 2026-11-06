import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../locale/locales/en.json";
import { ConnectedAgents } from "./connected-agents";

const { auth, agentAuthFetch, region } = vi.hoisted(() => {
  const auth = {
    useSession: vi.fn(),
    organization: { list: vi.fn() },
  };
  return {
    auth,
    agentAuthFetch: vi.fn(),
    region: {
      authClient: auth,
      manifest: { apiUrl: "https://api.example.test" },
    },
  };
});

vi.mock("../../region", () => ({ useRegionClients: () => region }));
vi.mock("../../auth/agent-auth-client", () => ({ agentAuthFetch }));

const grant = {
  id: "grant-1",
  clientName: "Hermes Agent",
  organizationIds: ["org-1"],
  resource: "https://api.example.test/mcp",
  scopes: ["workspace:read", "workspace:write", "offline_access"],
  updatedAt: "2026-10-24T20:06:07.000Z",
};

async function renderAgents() {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ConnectedAgents />
      </QueryClientProvider>
    </I18nextProvider>
  );
  return { ...view, queryClient };
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.useSession.mockReturnValue({ data: { user: { id: "user-1" } } });
  auth.organization.list.mockResolvedValue({
    data: [{ id: "org-1", name: "Lunaris Studio" }],
  });
  agentAuthFetch.mockResolvedValue({ grants: [grant] });
});

describe("ConnectedAgents", () => {
  it("resolves organization names and keeps every permission in a disclosure", async () => {
    const { container } = await renderAgents();

    expect(await screen.findByText("Lunaris Studio")).toBeTruthy();
    expect(screen.queryByText("org-1")).toBeNull();
    expect(screen.getByText("Updated Oct 24, 2026")).toBeTruthy();
    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
    await userEvent.click(screen.getByText("Permissions (3)"));
    expect(details?.open).toBe(true);
    expect(screen.getByText("Read workspaces")).toBeTruthy();
    expect(screen.getByText("Create and edit workspace content")).toBeTruthy();
    expect(screen.getByText("Stay connected with refresh tokens")).toBeTruthy();
    expect(screen.getByText(grant.resource)).toBeTruthy();
  });

  it("revokes the selected grant and refreshes the list", async () => {
    let revoked = false;
    agentAuthFetch.mockImplementation((_auth, path) => {
      if (path === "/agent/revoke") {
        revoked = true;
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ grants: revoked ? [] : [grant] });
    });
    await renderAgents();

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Revoke access for Hermes Agent",
      })
    );

    expect(agentAuthFetch).toHaveBeenCalledWith(auth, "/agent/revoke", {
      id: grant.id,
    });
    expect(await screen.findByText("No connected cloud agents.")).toBeTruthy();
    expect(screen.queryByText("Hermes Agent")).toBeNull();
  });

  it("keeps access visible and retryable after a failed revoke", async () => {
    agentAuthFetch.mockImplementation((_auth, path) =>
      path === "/agent/revoke"
        ? Promise.reject(new Error("Request failed"))
        : Promise.resolve({ grants: [grant] })
    );
    await renderAgents();

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Revoke access for Hermes Agent",
      })
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn’t revoke access. Try again."
    );
    expect(screen.getByText("Hermes Agent")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Revoke access for Hermes Agent" })
        .hasAttribute("disabled")
    ).toBe(false);
  });

  it("offers a retry when grants fail to load", async () => {
    agentAuthFetch.mockRejectedValueOnce(new Error("Network unavailable"));
    await renderAgents();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn’t load connected agents."
    );

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Hermes Agent")).toBeTruthy();
  });

  it("handles missing organizations and legacy grants without displaying IDs", async () => {
    agentAuthFetch.mockResolvedValue({
      grants: [
        { ...grant, organizationIds: ["missing-org"] },
        {
          ...grant,
          id: "legacy-grant",
          clientName: "Legacy Agent",
          organizationIds: [],
        },
      ],
    });
    await renderAgents();

    expect(await screen.findByText("Unavailable organization")).toBeTruthy();
    expect(screen.queryByText("missing-org")).toBeNull();
    expect(
      screen.getByText("Reconnect this agent to choose organizations.")
    ).toBeTruthy();
  });

  it("allows revocation when organization names fail to load", async () => {
    auth.organization.list.mockResolvedValue({
      error: { message: "Unavailable" },
    });
    await renderAgents();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Organization names are unavailable."
    );
    expect(
      screen
        .getByRole("button", { name: "Revoke access for Hermes Agent" })
        .hasAttribute("disabled")
    ).toBe(false);
  });

  it("does not fetch account data without a session", async () => {
    auth.useSession.mockReturnValue({ data: null });
    await renderAgents();

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(agentAuthFetch).not.toHaveBeenCalled();
    expect(auth.organization.list).not.toHaveBeenCalled();
  });
});
