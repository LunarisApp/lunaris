import {
  type AgentAccessManager,
  type AgentAccessStatus,
  createBrowserPlatform,
  PlatformProvider,
} from "@repo/platform";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentAccessSection } from "./agent-access-section";

vi.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSection(
  manager: AgentAccessManager,
  writeText = vi.fn().mockResolvedValue(undefined)
) {
  const platform = createBrowserPlatform({
    agentAccess: manager,
    kind: "desktop",
  });
  platform.clipboard = { writeText };
  render(
    <PlatformProvider platform={platform}>
      <AgentAccessSection />
    </PlatformProvider>
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
        "/Applications/Lunaris.app/Contents/MacOS/Lunaris"
      )
    ).toBeTruthy();
    expect(screen.getByText("mcp serve --access read")).toBeTruthy();
    expect(screen.getByRole("combobox").textContent).toContain(
      "settings.agents.agentAccess.mcpAccess_read"
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "settings.agents.agentAccess.mcpCopy",
      })
    );

    expect(writeText).toHaveBeenCalledWith(
      "/Applications/Lunaris.app/Contents/MacOS/Lunaris mcp serve --access read"
    );
  });

  it("clears the copy error after a successful retry", async () => {
    const manager: AgentAccessManager = {
      approve: vi.fn(),
      revoke: vi.fn(),
      setEnabled: vi.fn(),
      status: vi
        .fn()
        .mockResolvedValue({ enabled: true, grants: [], pending: [] }),
      mcpSetup: vi.fn().mockResolvedValue({
        command: "Lunaris",
        args: [],
        displayCommand: "Lunaris",
      }),
    };
    const writeText = vi
      .fn()
      .mockRejectedValueOnce(new Error("Clipboard denied"))
      .mockResolvedValue(undefined);
    renderSection(manager, writeText);
    const copyButton = await screen.findByRole("button", {
      name: "settings.agents.agentAccess.mcpCopy",
    });
    await userEvent.click(copyButton);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "settings.agents.agentAccess.copyFailed"
    );
    await userEvent.click(copyButton);
    await screen.findByText("settings.agents.agentAccess.mcpCopied");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("updates ChatGPT setup when requested access changes", async () => {
    const mcpSetup = vi.fn().mockImplementation(async (access: string) => ({
      args: ["mcp", "serve", "--access", access],
      command: "Lunaris",
      displayCommand: `Lunaris mcp serve --access ${access}`,
    }));
    const manager: AgentAccessManager = {
      approve: vi.fn(),
      revoke: vi.fn(),
      setEnabled: vi.fn(),
      mcpSetup,
      status: vi
        .fn()
        .mockResolvedValue({ enabled: true, grants: [], pending: [] }),
    };
    const { writeText } = renderSection(manager);
    await screen.findByText("mcp serve --access read");
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      screen.getByRole("option", {
        name: "settings.agents.agentAccess.mcpAccess_write",
      })
    );
    await screen.findByText("mcp serve --access write");
    await userEvent.click(
      screen.getByRole("button", {
        name: "settings.agents.agentAccess.mcpCopy",
      })
    );
    expect(writeText).toHaveBeenCalledWith("Lunaris mcp serve --access write");
  });

  it("hides ChatGPT setup until local access is enabled", async () => {
    const mcpSetup = vi.fn();
    const setEnabled = vi
      .fn()
      .mockResolvedValue({ enabled: true, grants: [], pending: [] });
    const manager: AgentAccessManager = {
      approve: vi.fn(),
      revoke: vi.fn(),
      setEnabled,
      mcpSetup,
      status: vi
        .fn()
        .mockResolvedValue({ enabled: false, grants: [], pending: [] }),
    };
    mcpSetup.mockResolvedValue({
      command: "Lunaris",
      args: [],
      displayCommand: "Lunaris",
    });
    renderSection(manager);
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    expect(
      screen.queryByText("settings.agents.agentAccess.mcpTitle")
    ).toBeNull();
    expect(mcpSetup).not.toHaveBeenCalled();
    await userEvent.click(toggle);
    expect(setEnabled).toHaveBeenCalledWith(true);
    await screen.findByText("settings.agents.agentAccess.mcpTitle");
  });

  it("does not restore a revoked client when an earlier poll finishes late", async () => {
    const revokedStatus: AgentAccessStatus = {
      enabled: true,
      address: "http://127.0.0.1:42000",
      grants: [],
      pending: [],
    };
    const previousStatus: AgentAccessStatus = {
      ...revokedStatus,
      grants: [
        {
          clientId: "client-1",
          clientName: "Revoked ChatGPT",
          createdAt: 1,
          scopes: ["organization:read"],
        },
      ],
    };
    let finishPoll: (status: AgentAccessStatus) => void = () => undefined;
    const delayedPoll = new Promise<AgentAccessStatus>((resolve) => {
      finishPoll = resolve;
    });
    const interval = vi.spyOn(window, "setInterval");
    const manager: AgentAccessManager = {
      approve: vi.fn(),
      setEnabled: vi.fn(),
      revoke: vi.fn().mockResolvedValue(revokedStatus),
      mcpSetup: vi.fn().mockResolvedValue({
        command: "Lunaris",
        args: [],
        displayCommand: "Lunaris",
      }),
      status: vi
        .fn()
        .mockResolvedValue(revokedStatus)
        .mockResolvedValueOnce(previousStatus)
        .mockReturnValueOnce(delayedPoll),
    };
    renderSection(manager);
    await screen.findByText("Revoked ChatGPT");
    const poll = interval.mock.calls.find(([, delay]) => delay === 2000)?.[0];
    if (typeof poll !== "function") {
      throw new Error("Agent status polling was not scheduled");
    }
    act(() => {
      poll();
    });
    expect(manager.status).toHaveBeenCalledTimes(2);
    await userEvent.click(
      screen.getByRole("button", {
        name: "settings.agents.agentAccess.revoke Revoked ChatGPT",
      })
    );
    await screen.findByText("settings.agents.agentAccess.noClients");
    await act(async () => {
      finishPoll(previousStatus);
    });
    expect(screen.queryByText("Revoked ChatGPT")).toBeNull();
  });

  it("shows pending and approved clients with approval and revocation actions", async () => {
    const nextStatus = {
      address: "http://127.0.0.1:42000",
      enabled: true,
      grants: [],
      pending: [],
    };
    const approve = vi.fn().mockResolvedValue({
      ...nextStatus,
      grants: [
        {
          clientId: "client-1",
          clientName: "Approved ChatGPT",
          createdAt: 1,
          scopes: ["organization:read"],
        },
      ],
    });
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
        name: "settings.agents.agentAccess.approve Pending ChatGPT",
      })
    );
    expect(approve).toHaveBeenCalledWith("request-1");

    await userEvent.click(
      screen.getByRole("button", {
        name: "settings.agents.agentAccess.revoke Approved ChatGPT",
      })
    );
    expect(revoke).toHaveBeenCalledWith("client-1");
  });
});
