import type { PluginEntityReferenceOption } from "@lunarisapp/plugin-sdk";

interface AgentWorkLaunch {
  attachments?: PluginEntityReferenceOption[];
  organizationId: string;
  submit: boolean;
  text: string;
  userId: string;
}

// History carries only the key. Back, reload, and a second mount cannot replay a prompt.
let pending: (AgentWorkLaunch & { key: string }) | undefined;

export function stageAgentWorkPrompt(launch: AgentWorkLaunch) {
  const key = crypto.randomUUID();
  pending = { ...launch, key };
  return key;
}

export function takeAgentWorkPrompt(
  key: unknown,
  scope: { organizationId: string; userId: string }
) {
  if (!pending || pending.key !== key) {
    return;
  }
  const launch = pending;
  pending = undefined;
  if (
    launch.organizationId === scope.organizationId &&
    launch.userId === scope.userId
  ) {
    return launch;
  }
}
