import { describe, expect, it, vi } from "vitest";
import { buildCommandSearchResults } from "./command-results";

const translate = (key: string) =>
  ({
    "common.settings": "Settings",
    "commands.extensions": "Extensions",
    "commands.focusMode": "Focus mode",
    "commands.debugger": "Debugger",
    "commands.openWorkspaceExplorer": "Explorer",
    "commands.renameResource": "Rename",
    "commands.closeTab": "Close tab",
  })[key] ?? key;

describe("buildCommandSearchResults", () => {
  it("excludes commands without actions", () => {
    const results = buildCommandSearchResults("settings", {}, translate);

    expect(results).toEqual([]);
  });

  it("matches translated labels case-insensitively", () => {
    const action = vi.fn();

    const results = buildCommandSearchResults(
      "SET",
      { "open-workspace-settings": action },
      translate
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "cmd-open-workspace-settings",
      label: "Settings",
      type: "command",
      action,
    });
  });

  it("shows every available command for an empty query", () => {
    const action = vi.fn();

    expect(
      buildCommandSearchResults(
        "",
        {
          "open-workspace-settings": action,
          "open-extensions": action,
          "open-debugger": action,
        },
        translate
      ).map((result) => result.id)
    ).toEqual([
      "cmd-open-workspace-settings",
      "cmd-open-extensions",
    ]);
  });

  it("finds commands excluded from empty-query suggestions", () => {
    const action = vi.fn();

    expect(
      buildCommandSearchResults(
        "",
        {
          "open-debugger": action,
          "open-workspace-explorer": action,
        },
        translate
      ).map((result) => result.id)
    ).toEqual([]);
    expect(
      buildCommandSearchResults(
        "explorer",
        { "open-workspace-explorer": action },
        translate,
      ).map((result) => result.id),
    ).toEqual(["cmd-open-workspace-explorer"]);
  });

  it("keeps workspace settings icon without an app-level shortcut", () => {
    const results = buildCommandSearchResults(
      "settings",
      { "open-workspace-settings": vi.fn() },
      translate
    );

    expect(results[0]?.shortcut).toBeUndefined();
    expect(results[0]?.icon).toBeDefined();
  });

  it("supports exact phrases and suppresses scoped queries", () => {
    const action = vi.fn();
    expect(
      buildCommandSearchResults(
        '"focus mode"',
        { "toggle-focus-mode": action },
        translate,
      ),
    ).toHaveLength(1);
    expect(
      buildCommandSearchResults(
        "workspace:demo",
        { "open-workspace-settings": action },
        translate,
      ),
    ).toEqual([]);
  });
});
