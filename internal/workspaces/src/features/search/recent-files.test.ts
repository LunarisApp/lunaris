import { beforeEach, describe, expect, it } from "vitest";
import {
  addRecentFileToList,
  filterRecentFilesByValidResources,
  getRecentFilesStorageKey,
  loadRecentFiles,
  parseRecentFiles,
  removeRecentFilesFromList,
  saveRecentFiles,
} from "./recent-files";
import type { RecentFile } from "./types";

describe("recent file helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("adds new files to front and caps at five", () => {
    let files: RecentFile[] = [];
    for (let index = 1; index <= 6; index++) {
      files = addRecentFileToList(
        files,
        `doc-${index}`,
        `Doc ${index}`,
        "plugin-text",
        index
      );
    }

    expect(files.map((file) => file.resourceId)).toEqual([
      "doc-6",
      "doc-5",
      "doc-4",
      "doc-3",
      "doc-2",
    ]);
  });

  it("moves existing files to front", () => {
    const files = [
      recentFile("doc-1", 1),
      recentFile("doc-2", 2),
      recentFile("doc-3", 3),
    ];

    expect(
      addRecentFileToList(files, "doc-2", "Doc 2 updated", "plugin-text", 4)
    ).toEqual([
      recentFile("doc-2", 4, "Doc 2 updated"),
      recentFile("doc-1", 1),
      recentFile("doc-3", 3),
    ]);
  });

  it("removes invalid resource IDs", () => {
    const files = [recentFile("doc-1", 1), recentFile("doc-2", 2)];

    expect(
      filterRecentFilesByValidResources(files, new Set(["doc-2"]))
    ).toEqual([recentFile("doc-2", 2)]);
  });

  it("removes requested resource IDs", () => {
    const files = [recentFile("doc-1", 1), recentFile("doc-2", 2)];

    expect(removeRecentFilesFromList(files, ["doc-1"])).toEqual([
      recentFile("doc-2", 2),
    ]);
  });

  it("falls back to empty list for malformed storage", () => {
    expect(parseRecentFiles("{nope")).toEqual([]);
    expect(parseRecentFiles(JSON.stringify({ resourceId: "doc-1" }))).toEqual(
      []
    );
  });

  it("loads only valid recent-file objects from localStorage", () => {
    localStorage.setItem(
      getRecentFilesStorageKey("workspace-1"),
      JSON.stringify([recentFile("doc-1", 1), { resourceId: "bad" }])
    );

    expect(loadRecentFiles("workspace-1")).toEqual([recentFile("doc-1", 1)]);
  });

  it("saves recent files with existing key format", () => {
    saveRecentFiles("workspace-1", [recentFile("doc-1", 1)]);

    expect(localStorage.getItem("lunaris:recent-files:workspace-1")).toBe(
      JSON.stringify([recentFile("doc-1", 1)])
    );
  });
});

function recentFile(
  resourceId: string,
  openedAt: number,
  title = resourceId
): RecentFile {
  return {
    resourceId,
    title,
    pluginId: "plugin-text",
    openedAt,
  };
}
