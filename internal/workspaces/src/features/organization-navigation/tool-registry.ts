import {
  AGENT_WORK_PANEL_ID,
  AGENT_WORK_RENDERER,
  AGENT_WORK_TOOL_ID,
} from "../agent-work/constants";
import {
  WORKSPACE_TRASH_PLUGIN_ID,
  WORKSPACE_TRASH_RENDERER,
  WORKSPACE_TRASH_TOOL_ID,
} from "../workspace-explorer/constants";
import { DEBUGGER_PLUGIN_ID, DEBUGGER_RENDERER } from "../debugger/constants";
import {
  EXTENSIONS_PLUGIN_ID,
  EXTENSIONS_RENDERER,
} from "../extensions/constants";
import {
  WORKSPACE_SETTINGS_PLUGIN_ID,
  WORKSPACE_SETTINGS_RENDERER,
} from "../workspace-settings/constants";

export const WORKSPACE_SETTINGS_TOOL_ID = "settings";

/**
 * Shell-agnostic registry for routable auxiliary tools.
 *
 * A ToolId is the URL-visible identifier and also the stable dockview panel id.
 * Tool ids MUST NOT collide with item id prefixes (`item_`, `yjs_`) so the
 * resolver can discriminate a tool id from an item id just by looking at it.
 *
 * Explorer intentionally lives outside this registry — it is persistent chrome
 * (left sidebar on desktop, main content on mobile), not a routable view.
 */

export interface ToolDescriptor {
  /** Registered dockview extension id (for renderer lookup). */
  pluginId: string;
  /** Registered renderer key under that extension. */
  renderer: string;
  /** i18n key for the panel title. */
  titleKey: string;
  /** URL-visible identifier; also used as the panel param `viewId`. */
  toolId: string;
}

const RESERVED_PREFIXES = ["item_", "yjs_"] as const;

function assertValidToolId(toolId: string): void {
  for (const prefix of RESERVED_PREFIXES) {
    if (toolId.startsWith(prefix)) {
      throw new Error(
        `Invalid toolId "${toolId}": must not start with reserved prefix "${prefix}"`
      );
    }
  }
}

const registry = {
  [AGENT_WORK_TOOL_ID]: {
    toolId: AGENT_WORK_TOOL_ID,
    pluginId: AGENT_WORK_PANEL_ID,
    renderer: AGENT_WORK_RENDERER,
    titleKey: "editor.agentWork",
  },
  debugger: {
    toolId: "debugger",
    pluginId: DEBUGGER_PLUGIN_ID,
    renderer: DEBUGGER_RENDERER,
    titleKey: "commands.debugger",
  },
  extensions: {
    toolId: "extensions",
    pluginId: EXTENSIONS_PLUGIN_ID,
    renderer: EXTENSIONS_RENDERER,
    titleKey: "commands.extensions",
  },
  [WORKSPACE_SETTINGS_TOOL_ID]: {
    toolId: WORKSPACE_SETTINGS_TOOL_ID,
    pluginId: WORKSPACE_SETTINGS_PLUGIN_ID,
    renderer: WORKSPACE_SETTINGS_RENDERER,
    titleKey: "common.settings",
  },
  [WORKSPACE_TRASH_TOOL_ID]: {
    toolId: WORKSPACE_TRASH_TOOL_ID,
    pluginId: WORKSPACE_TRASH_PLUGIN_ID,
    renderer: WORKSPACE_TRASH_RENDERER,
    titleKey: "trash.title",
  },
} as const satisfies Record<string, ToolDescriptor>;

for (const tool of Object.values(registry)) {
  assertValidToolId(tool.toolId);
}

export const TOOL_REGISTRY: Readonly<Record<string, ToolDescriptor>> = registry;

export type ToolId = keyof typeof registry;

export function getTool(toolId: string): ToolDescriptor | undefined {
  return TOOL_REGISTRY[toolId];
}

export function isToolId(viewId: string): viewId is ToolId {
  return viewId in TOOL_REGISTRY;
}
