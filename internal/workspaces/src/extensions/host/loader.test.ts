import { describe, expect, it } from "vitest";
import { loadWorkspacePluginIds } from "./loader";

const allExtensionIds = ["lunaris.notes", "lunaris.tasks"];

async function loadWithStoredRows(
  rows: Array<{ enabled: number; extension_id: string }>,
) {
  const db = {
    getAll: async <T,>() => rows as T[],
  };
  return loadWorkspacePluginIds({
    allExtensionIds,
    db,
    workspaceId: "workspace-1",
  });
}

it("uses configured defaults when external extensions are available", async () => {
  const ids = await loadWorkspacePluginIds({
    allExtensionIds: [...allExtensionIds, "community.calendar"],
    defaultExtensionIds: allExtensionIds,
    db: { getAll: async () => [] },
    workspaceId: "workspace-1",
  });
  expect(ids).toEqual(allExtensionIds);
});

it("preserves explicit workspace extension lists", async () => {
  const ids = await loadWorkspacePluginIds({
    allExtensionIds: [...allExtensionIds, "lunaris.excalidraw"],
    defaultExtensionIds: [...allExtensionIds, "lunaris.excalidraw"],
    db: {
      getAll: async () => [{ enabled: 1, extension_id: "lunaris.notes" }],
    },
    workspaceId: "workspace-1",
  });

  expect(ids).toEqual(["lunaris.notes"]);
});

describe("workspace plugin loader", () => {
  it("loads only valid enabled plugin IDs", async () => {
    const ids = await loadWithStoredRows([
      { enabled: 1, extension_id: "lunaris.tasks" },
      { enabled: 1, extension_id: "unknown.plugin" },
    ]);
    expect(ids).toEqual(["lunaris.tasks"]);
  });

  it("falls back to defaults without workspace configuration", async () => {
    expect(await loadWithStoredRows([])).toEqual(allExtensionIds);
  });

  it("preserves an explicitly empty workspace configuration", async () => {
    expect(
      await loadWithStoredRows([
        { enabled: 0, extension_id: "lunaris.rich-text" },
      ]),
    ).toEqual([]);
  });
});
