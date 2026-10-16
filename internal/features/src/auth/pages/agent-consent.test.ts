import { act, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  default as AgentConsentPage,
  loadAgentClientName,
  submitAgentConsent,
} from "./agent-consent";

const { regionClients } = vi.hoisted(() => ({
  regionClients: {
    authClient: null as { $fetch: ReturnType<typeof vi.fn> } | null,
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

describe("loadAgentClientName", () => {
  it("loads the registered OAuth client name", async () => {
    const fetch = vi.fn().mockResolvedValue({
      data: { client_name: " Lunaris CLI " },
      error: null,
    });

    await expect(
      loadAgentClientName({ $fetch: fetch } as never, "random-client-id")
    ).resolves.toBe("Lunaris CLI");
    expect(fetch).toHaveBeenCalledWith("/oauth2/public-client", {
      query: { client_id: "random-client-id" },
    });
  });

  it.each([
    { data: {}, error: null },
    { data: null, error: { message: "Client not found" } },
  ])(
    "uses the generic fallback when metadata is unavailable",
    async (result) => {
      const fetch = vi.fn().mockResolvedValue(result);

      await expect(
        loadAgentClientName({ $fetch: fetch } as never, "random-client-id")
      ).resolves.toBeUndefined();
    }
  );

  it("uses the generic fallback when metadata loading fails", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(
      loadAgentClientName({ $fetch: fetch } as never, "random-client-id")
    ).resolves.toBeUndefined();
  });
});

describe("AgentConsentPage", () => {
  it("returns to the generic label while a different client loads", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        data: { client_name: "Lunaris CLI" },
        error: null,
      })
      .mockReturnValueOnce(new Promise(() => undefined));
    regionClients.authClient = { $fetch: fetch };
    const router = createMemoryRouter(
      [
        {
          element: createElement(AgentConsentPage),
          path: "/auth/agent-consent",
        },
      ],
      {
        initialEntries: [
          "/auth/agent-consent?client_id=random-client-id&scope=workspace:read",
        ],
      }
    );

    render(createElement(RouterProvider, { router }));

    expect(
      await screen.findByText("Lunaris CLI wants permission")
    ).toBeTruthy();
    expect(screen.queryByText(/random-client-id/)).toBeNull();

    await act(async () => {
      await router.navigate(
        "/auth/agent-consent?client_id=other-client-id&scope=workspace:read"
      );
    });

    expect(screen.getByText("An AI client wants permission")).toBeTruthy();
    expect(screen.queryByText(/Lunaris CLI|other-client-id/)).toBeNull();
  });
});

describe("submitAgentConsent", () => {
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
