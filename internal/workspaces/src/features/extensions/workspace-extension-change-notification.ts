import type { ExtensionRuntimeChange } from "./extension-registry-context";

const CHANNEL_NAME = "lunaris-workspace-extension-changes-v1";
const EVENT_NAME = "lunaris:workspace-extension-change";

export interface WorkspaceExtensionChange extends ExtensionRuntimeChange {
  changeId: string;
  sourceId: string;
  workspaceId: string;
}

const SOURCE_ID = crypto.randomUUID();

export function notifyWorkspaceExtensionsChanged(
  change: Omit<WorkspaceExtensionChange, "changeId" | "sourceId">,
): void {
  const detail = {
    ...change,
    changeId: crypto.randomUUID(),
    sourceId: SOURCE_ID,
  };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
  if (!("BroadcastChannel" in globalThis)) return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(detail);
  channel.close();
}

export function subscribeToWorkspaceExtensionChanges(
  workspaceId: string,
  listener: (change: WorkspaceExtensionChange) => void,
): () => void {
  const seen = new Set<string>();
  const receive = (value: unknown) => {
    if (
      value &&
      typeof value === "object" &&
      "workspaceId" in value &&
      value.workspaceId === workspaceId
    ) {
      const change = value as WorkspaceExtensionChange;
      if (seen.has(change.changeId)) return;
      seen.add(change.changeId);
      listener(change);
    }
  };
  const receiveWindow = (event: Event) =>
    receive((event as CustomEvent<unknown>).detail);
  window.addEventListener(EVENT_NAME, receiveWindow);

  const channel =
    "BroadcastChannel" in globalThis
      ? new BroadcastChannel(CHANNEL_NAME)
      : undefined;
  if (channel) channel.onmessage = (event) => receive(event.data);

  return () => {
    window.removeEventListener(EVENT_NAME, receiveWindow);
    channel?.close();
  };
}
