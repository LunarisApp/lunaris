import {
  AiArtIcon,
  BlockGameIcon,
  BrochureIcon,
  Cancel01Icon,
  Chatting01Icon,
  ClipboardPasteIcon,
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  Home07Icon,
  type IconSvgObject,
  PictureInPicture01Icon,
  PlusSignIcon,
  ScanEyeIcon,
  Search01Icon,
  Settings01Icon,
  SidebarLeftIcon,
  Terminal,
} from "@lunarisapp/ui/icons";
import type { Hotkey } from "@tanstack/react-hotkeys";

export type HotkeyCategory = "general" | "navigation" | "workspaces";
export type HotkeyPlatform = "linux" | "mac" | "windows";
export type PlatformHotkey =
  | Hotkey
  | (Partial<Record<HotkeyPlatform, Hotkey>> & {
      default?: Hotkey;
    });

export interface HotkeyDefinition {
  category: HotkeyCategory;
  descriptionKey?: string;
  icon?: IconSvgObject;
  id: HotkeyId;
  /** TanStack hotkey string, optionally overridden per platform. */
  key: PlatformHotkey;
  /** i18n key for human-readable name */
  nameKey: string;
}

export type HotkeyId =
  | "toggle-search"
  | "open-home"
  | "open-workspace"
  | "open-ai-workflows"
  | "open-team-chats"
  | "open-settings"
  | "open-workspace-explorer"
  | "open-extensions"
  | "open-debugger"
  | "new-tab"
  | "close-tab"
  | "move-panel-to-new-window"
  | "copy-resources"
  | "paste-resources"
  | "delete-resource"
  | "rename-resource"
  | "toggle-focus-mode";

export const HOTKEYS: Record<HotkeyId, HotkeyDefinition> = {
  "toggle-search": {
    id: "toggle-search",
    key: "Mod+K",
    nameKey: "commands.search",
    category: "general",
    icon: Search01Icon,
  },
  "open-home": {
    id: "open-home",
    key: { mac: "Control+1", windows: "Alt+1", linux: "Alt+1" },
    nameKey: "common.home",
    category: "navigation",
    icon: Home07Icon,
  },
  "open-workspace": {
    id: "open-workspace",
    key: { mac: "Control+2", windows: "Alt+2", linux: "Alt+2" },
    nameKey: "editor.workspaces",
    category: "navigation",
    icon: BrochureIcon,
  },
  "open-ai-workflows": {
    id: "open-ai-workflows",
    key: { mac: "Control+3", windows: "Alt+3", linux: "Alt+3" },
    nameKey: "editor.agentWork",
    category: "navigation",
    icon: AiArtIcon,
  },
  "open-team-chats": {
    id: "open-team-chats",
    key: { mac: "Control+4", windows: "Alt+4", linux: "Alt+4" },
    nameKey: "editor.chats",
    category: "navigation",
    icon: Chatting01Icon,
  },
  "open-settings": {
    id: "open-settings",
    key: "Mod+,",
    nameKey: "common.settings",
    category: "general",
    icon: Settings01Icon,
  },
  "open-workspace-explorer": {
    id: "open-workspace-explorer",
    key: "Mod+Shift+E",
    nameKey: "commands.openWorkspaceExplorer",
    category: "workspaces",
    icon: SidebarLeftIcon,
  },
  "open-extensions": {
    id: "open-extensions",
    key: "Mod+Shift+X",
    nameKey: "commands.extensions",
    category: "workspaces",
    icon: BlockGameIcon,
  },
  "open-debugger": {
    id: "open-debugger",
    key: "Mod+Shift+D",
    nameKey: "commands.debugger",
    category: "workspaces",
    icon: Terminal,
  },
  "new-tab": {
    id: "new-tab",
    key: "Mod+N",
    nameKey: "gridLayout.emptyPanel.title",
    category: "workspaces",
    icon: PlusSignIcon,
  },
  "close-tab": {
    id: "close-tab",
    key: "Mod+Shift+W",
    nameKey: "commands.closeTab",
    category: "workspaces",
    icon: Cancel01Icon,
  },
  "move-panel-to-new-window": {
    id: "move-panel-to-new-window",
    key: "Mod+Shift+N",
    nameKey: "gridLayout.tab.moveToNewWindow",
    category: "workspaces",
    icon: PictureInPicture01Icon,
  },
  "copy-resources": {
    id: "copy-resources",
    key: "Mod+C",
    nameKey: "commands.copyResources",
    category: "general",
    icon: Copy01Icon,
  },
  "paste-resources": {
    id: "paste-resources",
    key: "Mod+V",
    nameKey: "commands.pasteResources",
    category: "general",
    icon: ClipboardPasteIcon,
  },
  "delete-resource": {
    id: "delete-resource",
    key: {
      mac: "Mod+Backspace",
      windows: "Delete",
      linux: "Delete",
    },
    nameKey: "commands.deleteResource",
    category: "general",
    icon: Delete02Icon,
  },
  "rename-resource": {
    id: "rename-resource",
    key: "F2",
    nameKey: "commands.renameResource",
    category: "workspaces",
    icon: Edit02Icon,
  },
  "toggle-focus-mode": {
    id: "toggle-focus-mode",
    key: "Mod+Shift+F",
    nameKey: "commands.focusMode",
    category: "workspaces",
    icon: ScanEyeIcon,
  },
};

export function isHotkeyId(value: string): value is HotkeyId {
  return value in HOTKEYS;
}
