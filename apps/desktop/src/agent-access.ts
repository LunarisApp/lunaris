import { useAuth } from "@repo/features/auth";
import {
  type AgentAccessManager,
  type AgentAccessStatus,
  type AgentMcpAccess,
  type AgentMcpSetup,
} from "@repo/platform";
import { serializeErrorForLog } from "@repo/utils/log-error";
import { invoke } from "@tauri-apps/api/core";
import { log } from "evlog";
import { useEffect } from "react";

function invokeStatus(
  command: string,
  args?: Record<string, unknown>,
): Promise<AgentAccessStatus> {
  return invoke<AgentAccessStatus>(command, args);
}

export const desktopAgentAccess: AgentAccessManager = {
  approve: (requestId) =>
    invokeStatus("agent_access_approve", { requestId }),
  mcpSetup: (access: AgentMcpAccess) =>
    invoke<AgentMcpSetup>("agent_mcp_setup", { access }),
  revoke: (clientId) => invokeStatus("agent_access_revoke", { clientId }),
  setEnabled: (enabled) =>
    invokeStatus("agent_access_set_enabled", { enabled }),
  status: () => invokeStatus("agent_access_status"),
};

export function DesktopAgentSessionBridge() {
  const auth = useAuth();
  const { data: session, isPending } = auth.useSession();
  const sessionId = session?.session?.id;

  useEffect(() => {
    if (isPending) return;
    void invoke("agent_access_set_session", {
      sessionId: sessionId ?? null,
    }).catch((error: unknown) => {
      log.error({
        action: "desktop.agent.session.update",
        error: serializeErrorForLog(error),
        outcome: "failure",
      });
    });
  }, [isPending, sessionId]);

  return null;
}
