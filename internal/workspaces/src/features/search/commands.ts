import type { IconSvgObject } from "@lunarisapp/ui/icons";
import {
  BlockGameIcon,
  FolderAddIcon,
  Download01Icon,
  Cancel01Icon,
  Edit02Icon,
  ScanEyeIcon,
  Settings01Icon,
  SidebarLeftIcon,
  Terminal,
} from "@lunarisapp/ui/icons";
import type { HotkeyId } from "@repo/features/hotkeys";

export interface CommandDefinition {
  /** Optional link to HOTKEYS entry for shortcut display */
  hotkeyId?: HotkeyId;
  icon?: IconSvgObject;
  id: CommandId;
  /** i18n key for human-readable name */
  nameKey: string;
  /** Whether to show the command before the user types a query. */
  suggestOnEmpty?: boolean;
}

export type CommandId =
  | "create-workspace"
  | "import-workspace"
  | "open-workspace-settings"
  | "open-extensions"
  | "open-workspace-explorer"
  | "toggle-focus-mode"
  | "open-debugger"
  | "rename-resource"
  | "close-tab";

export const COMMANDS: Record<CommandId, CommandDefinition> = {
  "create-workspace": {
    id: "create-workspace",
    nameKey: "workspaces.createWorkspace",
    icon: FolderAddIcon,
  },
  "import-workspace": {
    id: "import-workspace",
    nameKey: "workspaces.importFromObsidian",
    icon: Download01Icon,
  },
  "open-workspace-settings": {
    id: "open-workspace-settings",
    nameKey: "common.settings",
    icon: Settings01Icon,
  },
  "open-extensions": {
    id: "open-extensions",
    nameKey: "commands.extensions",
    icon: BlockGameIcon,
    hotkeyId: "open-extensions",
  },
  "open-workspace-explorer": {
    id: "open-workspace-explorer",
    nameKey: "commands.openWorkspaceExplorer",
    icon: SidebarLeftIcon,
    hotkeyId: "open-workspace-explorer",
    suggestOnEmpty: false,
  },
  "toggle-focus-mode": {
    id: "toggle-focus-mode",
    nameKey: "commands.focusMode",
    icon: ScanEyeIcon,
    hotkeyId: "toggle-focus-mode",
  },
  "open-debugger": {
    id: "open-debugger",
    nameKey: "commands.debugger",
    icon: Terminal,
    hotkeyId: "open-debugger",
    suggestOnEmpty: false,
  },
  "rename-resource": {
    id: "rename-resource",
    nameKey: "commands.renameResource",
    icon: Edit02Icon,
    hotkeyId: "rename-resource",
  },
  "close-tab": {
    id: "close-tab",
    nameKey: "commands.closeTab",
    icon: Cancel01Icon,
    hotkeyId: "close-tab",
  },
};
