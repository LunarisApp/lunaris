import { describe, expect, it } from "vitest";
import { HOTKEYS } from "@repo/features/hotkeys";
import { COMMANDS, type CommandId } from "./commands";

describe("COMMANDS registry", () => {
  it("every definition has required fields", () => {
    for (const [id, def] of Object.entries(COMMANDS)) {
      expect(def.id).toBe(id as CommandId);
      expect(def.nameKey).toBeTruthy();
    }
  });

  it("every hotkeyId references a valid HOTKEYS entry", () => {
    for (const def of Object.values(COMMANDS)) {
      if (def.hotkeyId) {
        expect(HOTKEYS[def.hotkeyId]).toBeDefined();
      }
    }
  });

  it("does not suggest the debugger", () => {
    expect(COMMANDS["open-debugger"].suggestOnEmpty).toBe(false);
  });

  it("offers workspace settings without an app-level shortcut", () => {
    expect(COMMANDS["open-workspace-settings"].hotkeyId).toBeUndefined();
    expect("open-settings" in COMMANDS).toBe(false);
  });
});
