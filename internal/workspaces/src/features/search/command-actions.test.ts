import { describe, expect, it, vi } from "vitest";
import { createCommandActions } from "./command-actions";

describe("createCommandActions", () => {
  it("does not expose account settings", () => {
    const actions = createCommandActions({
      closeViewInstances: vi.fn(),
      openExplorer: vi.fn(),
      openTool: vi.fn(),
      requestRenameActiveResource: vi.fn(),
      t: (key) => key,
      toggleFocusMode: vi.fn(),
    });

    expect("open-settings" in actions).toBe(false);
  });

  it("opens the extensions tool panel", () => {
    const openTool = vi.fn();
    const actions = createCommandActions({
      closeViewInstances: vi.fn(),
      openExplorer: vi.fn(),
      openTool,
      requestRenameActiveResource: vi.fn(),
      t: (key) => key,
      toggleFocusMode: vi.fn(),
    });

    actions["open-extensions"]!();

    expect(openTool).toHaveBeenCalledWith({ toolId: "extensions" });
  });

  it("opens workspace settings as a tool panel", () => {
    const openTool = vi.fn();
    const actions = createCommandActions({
      closeViewInstances: vi.fn(),
      openExplorer: vi.fn(),
      openTool,
      requestRenameActiveResource: vi.fn(),
      t: (key) => key,
      toggleFocusMode: vi.fn(),
    });

    actions["open-workspace-settings"]!();

    expect(openTool).toHaveBeenCalledWith({ toolId: "settings" });
  });

  it("opens the debugger when directly searched", () => {
    const openTool = vi.fn();
    const actions = createCommandActions({
      closeViewInstances: vi.fn(),
      openExplorer: vi.fn(),
      openTool,
      requestRenameActiveResource: vi.fn(),
      t: (key) => key,
      toggleFocusMode: vi.fn(),
    });

    actions["open-debugger"]?.();

    expect(openTool).toHaveBeenCalledWith({ toolId: "debugger" });
  });

  it("includes active-view commands only when they can act", () => {
    const closeViewInstances = vi.fn();
    const requestRenameActiveResource = vi.fn();
    const actions = createCommandActions({
      activeResourceId: "item_1",
      activeViewInstanceId: "item_1",
      closeViewInstances,
      openExplorer: vi.fn(),
      openTool: vi.fn(),
      requestRenameActiveResource,
      t: (key) => key,
      toggleFocusMode: vi.fn(),
    });

    actions["close-tab"]?.();
    actions["rename-resource"]?.();

    expect(closeViewInstances).toHaveBeenCalledWith(["item_1"]);
    expect(requestRenameActiveResource).toHaveBeenCalledOnce();
  });
});
