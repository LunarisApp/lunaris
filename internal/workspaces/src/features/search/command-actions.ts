import { createOpenDebuggerPanelAction } from "../debugger";
import { WORKSPACE_SETTINGS_TOOL_ID } from "../organization-navigation/tool-registry";
import type { CommandActions } from "./hooks/useCommandSearch";

interface CreateCommandActionsParams {
  activeResourceId?: string | null;
  activeViewInstanceId?: string | null;
  closeViewInstances: (viewInstanceIds: string[]) => void;
  openExplorer: () => void;
  openTool: (input: { toolId: string }) => void;
  requestRenameActiveResource: () => void;
  t: (key: string) => string;
  toggleFocusMode: () => void;
}

export function createCommandActions({
  activeResourceId,
  activeViewInstanceId,
  closeViewInstances,
  openExplorer,
  openTool,
  requestRenameActiveResource,
  t,
  toggleFocusMode,
}: CreateCommandActionsParams): CommandActions {
  const actions: CommandActions = {
    "open-workspace-settings": () => {
      openTool({ toolId: WORKSPACE_SETTINGS_TOOL_ID });
    },
    "open-extensions": () => {
      openTool({ toolId: "extensions" });
    },
    "open-workspace-explorer": openExplorer,
    "open-debugger": createOpenDebuggerPanelAction({ openTool, t }),
  };

  if (activeViewInstanceId) {
    actions["close-tab"] = () => closeViewInstances([activeViewInstanceId]);
    actions["toggle-focus-mode"] = toggleFocusMode;
  }
  if (activeResourceId) {
    actions["rename-resource"] = requestRenameActiveResource;
  }

  return actions;
}
