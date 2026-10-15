import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, sessionState } = vi.hoisted(() => ({
  invoke: vi.fn(),
  sessionState: {
    data: undefined as
      | { session: { id: string } }
      | null
      | undefined,
    isPending: true,
  },
}));

vi.mock("@repo/features/auth", () => ({
  useAuth: () => ({
    useSession: () => sessionState,
  }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  DesktopAgentSessionBridge,
  desktopAgentAccess,
} from "./agent-access";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  sessionState.data = undefined;
  sessionState.isPending = true;
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
});

describe("DesktopAgentSessionBridge", () => {
  it("does not revoke grants while initial session loading is pending", async () => {
    await act(async () => root.render(<DesktopAgentSessionBridge />));

    expect(invoke).not.toHaveBeenCalled();
  });

  it("updates the broker for authenticated and signed-out sessions", async () => {
    sessionState.isPending = false;
    sessionState.data = { session: { id: "session-1" } };
    await act(async () => root.render(<DesktopAgentSessionBridge />));

    expect(invoke).toHaveBeenLastCalledWith("agent_access_set_session", {
      sessionId: "session-1",
    });

    sessionState.data = null;
    await act(async () => root.render(<DesktopAgentSessionBridge />));

    expect(invoke).toHaveBeenLastCalledWith("agent_access_set_session", {
      sessionId: null,
    });
  });
});

describe("desktopAgentAccess", () => {
  it("requests bundled MCP setup with read-only access", async () => {
    invoke.mockResolvedValue({
      args: ["mcp", "serve", "--access", "read"],
      command: "/Applications/Lunaris.app/Contents/MacOS/Lunaris",
      displayCommand:
        "/Applications/Lunaris.app/Contents/MacOS/Lunaris mcp serve --access read",
    });
    await desktopAgentAccess.mcpSetup("read");

    expect(invoke).toHaveBeenCalledWith("agent_mcp_setup", {
      access: "read",
    });
  });
});
