import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  default as AgentConsentPage,
  submitAgentConsent,
} from "./agent-consent";

const { regionClients } = vi.hoisted(() => ({
  regionClients: {
    authClient: null as {
      $fetch: ReturnType<typeof vi.fn>;
      useSession: () => unknown;
    } | null,
    manifest: { apiUrl: "http://localhost:3000" },
  },
}));

vi.mock("../../region", () => ({
  useRegion: () => ({
    pathWithRegion: (path: string) => path,
    region: { id: "us", label: "United States" },
  }),
  useRegionClients: () => regionClients,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { client?: string; region?: string }) => {
      if (key === "auth.agentConsentDescription") {
        return `${values?.client} wants permission`;
      }
      return (
        (
          {
            "auth.agentConsentAllow": "Allow",
            "auth.agentConsentDeny": "Deny",
            "auth.agentConsentTitle": "Authorize agent",
            "auth.agentConsentUnknownClient": "An AI client",
            "auth.changeRegion": `Change region from ${values?.region}`,
          } as Record<string, string>
        )[key] ?? key
      );
    },
  }),
}));

describe("AgentConsentPage", () => {
  function mount(
    fetch: ReturnType<typeof vi.fn>,
    search = "?client_id=cli&sig=signed"
  ) {
    regionClients.authClient = {
      $fetch: fetch,
      useSession: () => ({
        data: { user: { id: "user-1", emailVerified: true } },
        isPending: false,
      }),
    };
    const router = createMemoryRouter(
      [
        {
          path: "/auth/agent-consent",
          element: createElement(AgentConsentPage),
        },
      ],
      { initialEntries: [`/auth/agent-consent${search}`] }
    );
    render(
      createElement(QueryClientProvider, {
        client: new QueryClient({
          defaultOptions: { queries: { retry: false } },
        }),
        children: createElement(RouterProvider, { router }),
      })
    );
    return router;
  }
  const details = {
    clientId: "cli",
    clientName: "Lunaris CLI",
    scopes: ["workspace:read"],
    resources: ["http://localhost:3000/mcp"],
    organizations: [{ id: "org-1", name: "My organization" }],
  };
  it("requires organization selection and allows retry after consent network failure", async () => {
    const fetch = vi
      .fn()
      .mockImplementation((path: string) =>
        path === "/agent/authorization"
          ? Promise.resolve({ data: details })
          : path === "/agent/authorize"
            ? Promise.resolve({ data: { success: true } })
            : Promise.reject(new Error("Network error"))
      );
    mount(fetch);
    await screen.findByText("Lunaris CLI");
    expect(
      screen.getByRole("button", { name: "Allow" }).hasAttribute("disabled")
    ).toBe(true);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(
      await screen.findByRole("option", { name: "My organization" })
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("Network error");
    expect(
      screen.getByRole("button", { name: "Allow" }).hasAttribute("disabled")
    ).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      "/agent/authorize",
      expect.objectContaining({
        body: expect.objectContaining({ organizationIds: ["org-1"] }),
      })
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    });
    expect(
      fetch.mock.calls.filter(([path]) => path === "/oauth2/consent")
    ).toHaveLength(2);
  });
  it("clears previous identity when authorization request changes", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ data: details })
      .mockReturnValueOnce(new Promise(() => undefined));
    const router = mount(fetch);
    await screen.findByText("Lunaris CLI");
    await act(async () => {
      await router.navigate("/auth/agent-consent?client_id=other&sig=signed");
    });
    expect(screen.queryByText("Lunaris CLI")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });
  it("reloads details and clears selections when the signed-in account changes", async () => {
    const fetch = vi.fn().mockResolvedValue({ data: details });
    const router = mount(fetch);
    await screen.findByText("Lunaris CLI");
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(
      await screen.findByRole("option", { name: "My organization" })
    );
    expect(
      screen.getByRole("button", { name: "Allow" }).hasAttribute("disabled")
    ).toBe(false);
    regionClients.authClient!.useSession = () => ({
      data: { user: { id: "user-2", emailVerified: true } },
      isPending: false,
    });
    await act(async () => {
      await router.navigate("/auth/agent-consent?client_id=cli&sig=signed", {
        state: { accountChanged: true },
      });
    });
    await screen.findByText("Lunaris CLI");
    expect(
      fetch.mock.calls.filter(([path]) => path === "/agent/authorization")
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Allow" }).hasAttribute("disabled")
    ).toBe(true);
  });
  it("rejects requests belonging to another region", () => {
    const fetch = vi.fn();
    mount(fetch, "?issuer=https%3A%2F%2Fother.example");
    expect(screen.getByRole("alert").textContent).toBe(
      "auth.agentAuthorization.regionMismatch"
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("submitAgentConsent", () => {
  it.each([true, false])(
    "preserves signed parameters when routing adds region (accept=%s)",
    async (accept) => {
      const fetch = vi.fn().mockResolvedValue({
        data: { url: "http://127.0.0.1/oauth/callback" },
      });
      const signedParams = new URLSearchParams({
        client_id: "cli",
        sig: "signed+value=",
      });
      signedParams.append("resource", "https://api.lunaris.app");
      signedParams.append("resource", "https://api.lunaris.app/mcp");
      for (const name of ["client_id", "resource", "ba_param"]) {
        signedParams.append("ba_param", name);
      }
      const pageParams = new URLSearchParams(signedParams);
      pageParams.set("region", "us");
      pageParams.set("redirectTo", "/");

      await submitAgentConsent(
        { $fetch: fetch } as never,
        accept,
        pageParams.toString()
      );

      expect(fetch).toHaveBeenCalledWith("/oauth2/consent", {
        body: { accept, oauth_query: signedParams.toString() },
        method: "POST",
      });
    }
  );

  it("posts to OAuth Provider's nested consent endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue({
      data: { redirect_uri: "http://127.0.0.1/oauth/callback" },
      error: null,
    });

    await submitAgentConsent(
      { $fetch: fetch } as never,
      true,
      "client_id=cli&sig=signed"
    );

    expect(fetch).toHaveBeenCalledWith("/oauth2/consent", {
      body: {
        accept: true,
        oauth_query: "client_id=cli&sig=signed",
      },
      method: "POST",
    });
  });
});
