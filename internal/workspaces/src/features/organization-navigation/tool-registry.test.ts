import { describe, expect, it } from "vitest";
import { getTool, isToolId, TOOL_REGISTRY } from "./tool-registry";

describe("tool-registry", () => {
  it("exposes built-in tools", () => {
    expect(TOOL_REGISTRY.debugger?.toolId).toBe("debugger");
    expect(TOOL_REGISTRY.extensions?.toolId).toBe("extensions");
    expect(TOOL_REGISTRY.settings?.toolId).toBe("settings");
    expect(TOOL_REGISTRY.settings?.titleKey).toBe("common.settings");
  });

  it("resolves a known tool id via getTool", () => {
    expect(getTool("debugger")?.pluginId).toBe("system-debugger");
  });

  it("returns undefined for unknown tool ids", () => {
    expect(getTool("not-a-tool")).toBeUndefined();
  });

  it("identifies tool ids via isToolId", () => {
    expect(isToolId("debugger")).toBe(true);
    expect(isToolId("extensions")).toBe(true);
    expect(isToolId("settings")).toBe(true);
    expect(isToolId("workspace-settings")).toBe(false);
    expect(isToolId("item_abc")).toBe(false);
    expect(isToolId("yjs_abc")).toBe(false);
    expect(isToolId("garbage")).toBe(false);
  });

  it("has no tool id that collides with item_ or yjs_ prefixes", () => {
    for (const tool of Object.values(TOOL_REGISTRY)) {
      expect(tool.toolId.startsWith("item_")).toBe(false);
      expect(tool.toolId.startsWith("yjs_")).toBe(false);
    }
  });
});
