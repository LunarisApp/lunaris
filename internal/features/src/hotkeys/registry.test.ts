import {
  ClipboardPasteIcon,
  PictureInPicture01Icon,
} from "@lunarisapp/ui/icons";
import { describe, expect, it } from "vitest";
import { getHotkeyBinding } from "./helpers";
import { HOTKEYS, type HotkeyId } from "./registry";

describe("HOTKEYS registry", () => {
  it("has no duplicate key combos per platform", () => {
    for (const platform of ["mac", "windows", "linux"] as const) {
      const keys = Object.values(HOTKEYS).map((hotkey) =>
        getHotkeyBinding(hotkey, platform)
      );
      const unique = new Set(keys);
      expect(unique.size).toBe(keys.length);
    }
  });

  it("every definition has required fields", () => {
    for (const [id, def] of Object.entries(HOTKEYS)) {
      expect(def.id).toBe(id as HotkeyId);
      expect(def.key).toBeTruthy();
      expect(def.nameKey).toBeTruthy();
      expect(def.category).toBeTruthy();
    }
  });

  it("registers the debugger hotkey", () => {
    expect(HOTKEYS["open-debugger"]).toMatchObject({
      id: "open-debugger",
      key: "Mod+Shift+D",
      nameKey: "commands.debugger",
      category: "workspaces",
    });
  });

  it("registers app settings on Mod+,", () => {
    expect(HOTKEYS["open-settings"]).toMatchObject({
      id: "open-settings",
      key: "Mod+,",
      nameKey: "common.settings",
      category: "general",
    });
    expect("open-workspace-settings" in HOTKEYS).toBe(false);
  });

  it("registers organization navigation shortcuts", () => {
    expect(HOTKEYS["open-workspace-explorer"]).toMatchObject({
      key: "Mod+Shift+E",
      nameKey: "commands.openWorkspaceExplorer",
      category: "workspaces",
    });
    expect(HOTKEYS["open-extensions"]).toMatchObject({
      key: "Mod+Shift+X",
      nameKey: "commands.extensions",
      category: "workspaces",
    });
  });

  it("maps workspace editor rail shortcuts to platform conventions", () => {
    const ids = [
      "open-home",
      "open-workspace",
      "open-ai-workflows",
      "open-team-chats",
    ] as const;

    ids.forEach((id, index) => {
      const number = index + 1;
      expect(HOTKEYS[id].category).toBe("navigation");
      expect(getHotkeyBinding(HOTKEYS[id], "mac")).toBe(
        `Control+${number}`
      );
      expect(getHotkeyBinding(HOTKEYS[id], "windows")).toBe(`Alt+${number}`);
      expect(getHotkeyBinding(HOTKEYS[id], "linux")).toBe(`Alt+${number}`);
    });

    expect(HOTKEYS["open-workspace"].nameKey).toBe("editor.workspaces");
  });

  it("registers the close tab hotkey", () => {
    expect(HOTKEYS["close-tab"]).toMatchObject({
      id: "close-tab",
      key: "Mod+Shift+W",
      nameKey: "commands.closeTab",
      category: "workspaces",
    });
  });

  it("registers the move panel to new window hotkey", () => {
    expect(HOTKEYS["move-panel-to-new-window"]).toMatchObject({
      id: "move-panel-to-new-window",
      key: "Mod+Shift+N",
      nameKey: "gridLayout.tab.moveToNewWindow",
      category: "workspaces",
      icon: PictureInPicture01Icon,
    });
  });

  it("registers the new tab hotkey", () => {
    expect(HOTKEYS["new-tab"]).toMatchObject({
      id: "new-tab",
      key: "Mod+N",
      nameKey: "gridLayout.emptyPanel.title",
      category: "workspaces",
    });

    expect("new-workspace" in HOTKEYS).toBe(false);
  });

  it("maps delete to platform conventions", () => {
    expect(HOTKEYS["delete-resource"].nameKey).toBe("commands.deleteResource");
    expect(getHotkeyBinding(HOTKEYS["delete-resource"], "mac")).toBe("Mod+Backspace");
    expect(getHotkeyBinding(HOTKEYS["delete-resource"], "windows")).toBe("Delete");
    expect(getHotkeyBinding(HOTKEYS["delete-resource"], "linux")).toBe("Delete");
  });

  it("registers the paste icon", () => {
    expect(HOTKEYS["paste-resources"].icon).toBe(ClipboardPasteIcon);
  });
});
