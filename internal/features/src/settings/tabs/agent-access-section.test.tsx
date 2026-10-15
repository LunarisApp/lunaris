import {
  type AgentAccessManager,
  createBrowserPlatform,
  PlatformProvider,
} from "@repo/platform";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentAccessSection } from "./agent-access-section";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSection(
  manager: AgentAccessManager,
  writeText = vi.fn().mockResolvedValue(undefined),
) {
  const platform = createBrowserPlatform({
    agentAccess: manager,
    kind: "desktop",
  });
  platform.clipboard = { writeText };
  render(
    <PlatformProvider platform={platform}>
      <AgentAccessSection />
    </PlatformProvider>,
  );
  return { writeText };
}

describe("AgentAccessSection ChatGPT setup", () => {
  it("defaults to read-only and copies the installed executable command", async () => {
    const mcpSetup = vi.fn().mockResolvedValue({
      args: ["mcp", "serve", "--access", "read"],
      command: "/Applications/Lunaris.app/Contents/MacOS/Lunaris",
      displayCommand:
        "/Applications/Lunaris.app/Contents/MacOS/Lunaris mcp serve --access read",
    });
    const manager: AgentAccessManager = {
      approve: vi.fn(),
      mcpSetup,
      revoke: vi.fn(),
      setEnabled: vi.fn(),
      status: vi.fn().mockResolvedValue({
        address: "http://127.0.0.1:42000",
        enabled: true,
        grants: [],
        pending: [],
      }),
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    renderSection(manager, writeText);

    await waitFor(() => expect(mcpSetup).toHaveBeenCalledWith("read"));
    expect(
      await screen.findByText(
        "/Applications/Lunaris.app/Contents/MacOS/Lunaris",
      ),
    ).toBeTruthy();
    expect(screen.getByText("mcp serve --access read")).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", {
        name: "settings.local-data.agentAccess.mcpCopy",
      }),
    );

    expect(writeText).toHaveBeenCalledWith(
      "/Applications/Lunaris.app/Contents/MacOS/Lunaris mcp serve --access read",
    );
  });

  it("shows pending and approved clients with approval and revocation actions", async () => {
    const nextStatus = {
      address: "http://127.0.0.1:42000",
      enabled: true,
      grants: [],
      pending: [],
    };
    const approve = vi.fn().mockResolvedValue(nextStatus);
    const revoke = vi.fn().mockResolvedValue(nextStatus);
    const manager: AgentAccessManager = {
      approve,
      mcpSetup: vi.fn().mockResolvedValue({
        args: ["mcp", "serve", "--access", "read"],
        command: "Lunaris",
        displayCommand: "Lunaris mcp serve --access read",
      }),
      revoke,
      setEnabled: vi.fn(),
      status: vi.fn().mockResolvedValue({
        ...nextStatus,
        grants: [
          {
            clientId: "client-1",
            clientName: "Approved ChatGPT",
            createdAt: 1,
            scopes: ["organization:read"],
          },
        ],
        pending: [
          {
            clientName: "Pending ChatGPT",
            code: "123 456",
            requestId: "request-1",
            scopes: ["organization:read"],
          },
        ],
      }),
    };

    renderSection(manager);

    expect(await screen.findByText("Pending ChatGPT")).toBeTruthy();
    expect(screen.getByText("Approved ChatGPT")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", {
        name: "settings.local-data.agentAccess.approve Pending ChatGPT",
      }),
    );
    expect(approve).toHaveBeenCalledWith("request-1");

    await userEvent.click(
      screen.getByRole("button", {
        name: "settings.local-data.agentAccess.revoke Approved ChatGPT",
      }),
    );
    expect(revoke).toHaveBeenCalledWith("client-1");
  });
});
