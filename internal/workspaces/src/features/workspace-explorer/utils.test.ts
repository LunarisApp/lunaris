import {
  FileUnknownIcon,
  Folder01Icon,
  Folder02Icon,
  UserAccountIcon,
} from "@lunarisapp/ui/icons";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { describe, expect, it } from "vitest";
import { VIRTUAL_ROOT_ID } from "./constants";
import type { WorkspaceResourcesMap } from "./types";
import {
  isFolder,
  isResourceTypeIconLoading,
  parseResourceIcon,
  resolveWorkspaceResourceIcon,
} from "./types";
import {
  filterOutNestedSelections,
  getAncestorPath,
  getDeleteDescriptionI18n,
  resolveDeleteTargets,
  toDeleteTargetName,
  UNTITLED_FALLBACK,
} from "./utils";

function makeItem(
  overrides: Partial<WorkspaceResourceEntity> & { id: string }
): WorkspaceResourceEntity {
  return {
    workspace_id: "workspace_1",
    name: "item",
    icon: null,
    position: 0,
    parent_id: null,
    resource_type_id: null,
    schema_version: 1,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

function makeMap(
  items: (Partial<WorkspaceResourceEntity> & { id: string })[]
): WorkspaceResourcesMap {
  return new Map(items.map((i) => [i.id, makeItem(i)]));
}

describe("parseResourceIcon", () => {
  it("parses valid JSON icon", () => {
    const icon = { d: "M0 0L1 1", viewBox: "0 0 24 24" };
    const item = makeItem({ id: "a", icon: JSON.stringify(icon) });
    expect(parseResourceIcon(item)).toEqual(icon);
  });

  it("returns undefined for null icon", () => {
    const item = makeItem({ id: "a", icon: null });
    expect(parseResourceIcon(item)).toBeUndefined();
  });

  it("returns undefined for invalid JSON", () => {
    const item = makeItem({ id: "a", icon: "not-json" });
    expect(parseResourceIcon(item)).toBeUndefined();
  });
});

describe("isFolder", () => {
  it("returns true for the core folder resource", () => {
    const item = makeItem({ id: "a", resource_type_id: "lunaris.folder" });
    expect(isFolder(item)).toBe(true);
  });

  it("returns false when resource_type_id is set", () => {
    const item = makeItem({ id: "a", resource_type_id: "lunaris.compiler" });
    expect(isFolder(item)).toBe(false);
  });
});

describe("isResourceTypeIconLoading", () => {
  it("loads icons for enabled extension resource types and their namespace", () => {
    const runtime = {
      enabledExtensionIds: ["lunaris.kanban"],
      extensionAvailability: { "lunaris.kanban": "available" },
    } as const;

    expect(
      isResourceTypeIconLoading({
        ...runtime,
        resourceTypeId: "lunaris.kanban",
      }),
    ).toBe(true);
    expect(
      isResourceTypeIconLoading({
        ...runtime,
        resourceTypeId: "lunaris.kanban.task",
      }),
    ).toBe(true);
  });

  it("does not load icons for unavailable extensions", () => {
    expect(
      isResourceTypeIconLoading({
        enabledExtensionIds: [],
        extensionAvailability: {},
        resourceTypeId: "acme.uninstalled",
      }),
    ).toBe(false);
    expect(
      isResourceTypeIconLoading({
        enabledExtensionIds: ["acme.failed"],
        extensionAvailability: { "acme.failed": "load-failure" },
        resourceTypeId: "acme.failed",
      }),
    ).toBe(false);
  });
});

describe("resolveWorkspaceResourceIcon", () => {
  it("uses custom item icon first", () => {
    const item = makeItem({
      id: "a",
      icon: JSON.stringify(UserAccountIcon),
      resource_type_id: "missing",
    });
    expect(resolveWorkspaceResourceIcon({ item })).toEqual(UserAccountIcon);
  });

  it("uses registered resource type icon", () => {
    const item = makeItem({
      id: "a",
      resource_type_id: "lunaris.rich-text",
    });
    expect(resolveWorkspaceResourceIcon({ resourceIcon: UserAccountIcon, item }))
      .toBe(UserAccountIcon);
  });

  it("returns undefined while an enabled extension resource type loads", () => {
    const item = makeItem({
      id: "a",
      resource_type_id: "lunaris.rich-text",
    });
    expect(resolveWorkspaceResourceIcon({ item, resourceIconLoading: true }))
      .toBeUndefined();
  });

  it("uses unknown icon when an extension resource type is unavailable", () => {
    const item = makeItem({
      id: "a",
      resource_type_id: "acme.uninstalled",
    });
    expect(resolveWorkspaceResourceIcon({ item })).toBe(FileUnknownIcon);
  });

  it("uses unknown icon for rows missing resource_type_id", () => {
    const item = makeItem({ id: "a" });
    expect(resolveWorkspaceResourceIcon({ item })).toBe(FileUnknownIcon);
  });

  it("uses folder icons for collapsed and expanded folders", () => {
    const item = makeItem({ id: "a", resource_type_id: "lunaris.folder" });
    expect(resolveWorkspaceResourceIcon({ item })).toBe(Folder01Icon);
    expect(resolveWorkspaceResourceIcon({ isExpanded: true, item })).toBe(
      Folder02Icon
    );
  });
});

describe("getAncestorPath", () => {
  it("returns path from item to top-level folder", () => {
    const map = makeMap([
      { id: "folder", parent_id: null, name: "Folder" },
      { id: "doc", parent_id: "folder", name: "Doc" },
    ]);
    const path = getAncestorPath(map, "doc");
    expect(path).toHaveLength(2);
    expect(path[0]?.id).toBe("folder");
    expect(path[1]?.id).toBe("doc");
  });

  it("returns single-item path for top-level doc", () => {
    const map = makeMap([
      { id: "doc", parent_id: null, name: "Doc" },
    ]);
    const path = getAncestorPath(map, "doc");
    expect(path).toHaveLength(1);
    expect(path[0]?.id).toBe("doc");
  });

  it("returns single-item path for root-level documents", () => {
    const map = makeMap([
      {
        id: "doc",
        parent_id: null,
        name: "Doc",
        resource_type_id: "lunaris.rich-text",
      },
    ]);
    const path = getAncestorPath(map, "doc");
    expect(path).toHaveLength(1);
    expect(path[0]?.id).toBe("doc");
  });

  it("returns single-item path for top-level folders too", () => {
    const map = makeMap([{ id: "folder", parent_id: null, name: "Folder" }]);
    const path = getAncestorPath(map, "folder");
    expect(path).toHaveLength(1);
    expect(path[0]?.id).toBe("folder");
  });

  it("excludes the synthetic virtual root from the path", () => {
    const map = makeMap([
      { id: VIRTUAL_ROOT_ID, parent_id: null, name: "Root" },
      { id: "folder", parent_id: VIRTUAL_ROOT_ID, name: "Folder" },
      { id: "doc", parent_id: "folder", name: "Doc" },
    ]);
    const path = getAncestorPath(map, "doc");
    expect(path).toHaveLength(2);
    expect(path[0]?.id).toBe("folder");
    expect(path[1]?.id).toBe("doc");
  });

  it("returns empty for non-existent item", () => {
    const map = makeMap([{ id: "root", parent_id: null }]);
    const path = getAncestorPath(map, "missing");
    expect(path).toHaveLength(0);
  });
});

describe("filterOutNestedSelections", () => {
  it("preserves siblings", () => {
    const map = makeMap([
      { id: "a", parent_id: null },
      { id: "b", parent_id: null },
    ]);
    expect(filterOutNestedSelections(["a", "b"], map)).toEqual(["a", "b"]);
  });

  it("drops descendant when ancestor is also selected", () => {
    const map = makeMap([
      { id: "folder", parent_id: null },
      { id: "child", parent_id: "folder" },
    ]);
    expect(filterOutNestedSelections(["folder", "child"], map)).toEqual([
      "folder",
    ]);
  });

  it("drops grandchild when grandparent is also selected", () => {
    const map = makeMap([
      { id: "a", parent_id: null },
      { id: "b", parent_id: "a" },
      { id: "c", parent_id: "b" },
    ]);
    expect(filterOutNestedSelections(["a", "c"], map)).toEqual(["a"]);
  });

  it("preserves disjoint subtrees", () => {
    const map = makeMap([
      { id: "a", parent_id: null },
      { id: "a1", parent_id: "a" },
      { id: "b", parent_id: null },
      { id: "b1", parent_id: "b" },
    ]);
    expect(filterOutNestedSelections(["a1", "b1"], map)).toEqual(["a1", "b1"]);
  });

  it("is identity on empty or single", () => {
    const map = makeMap([{ id: "a", parent_id: null }]);
    expect(filterOutNestedSelections([], map)).toEqual([]);
    expect(filterOutNestedSelections(["a"], map)).toEqual(["a"]);
  });

  it("terminates on cyclic parent chains", () => {
    const map = makeMap([
      { id: "a", parent_id: "b" },
      { id: "b", parent_id: "a" },
    ]);
    // Pathological cycle — assert we don't hang. Result shape not semantically
    // meaningful, just verify completion.
    expect(() => filterOutNestedSelections(["a", "b"], map)).not.toThrow();
  });

  it("treats id missing from map as a root (no parent to check)", () => {
    const map = makeMap([{ id: "a", parent_id: null }]);
    // 'ghost' has no entry; function treats it as having no parent, keeps it.
    expect(filterOutNestedSelections(["a", "ghost"], map)).toEqual([
      "a",
      "ghost",
    ]);
  });

  it("stops walk when an intermediate parent is missing from the map", () => {
    const map = makeMap([
      { id: "a", parent_id: null },
      // 'c' points to a parent that isn't in the map; walk terminates.
      { id: "c", parent_id: "missing" },
    ]);
    expect(filterOutNestedSelections(["a", "c"], map)).toEqual(["a", "c"]);
  });
});

describe("toDeleteTargetName", () => {
  it("returns the name when truthy", () => {
    expect(toDeleteTargetName("Doc")).toBe("Doc");
  });

  it("falls back to UNTITLED_FALLBACK when empty string", () => {
    expect(toDeleteTargetName("")).toBe(UNTITLED_FALLBACK);
  });

  it("falls back to UNTITLED_FALLBACK when null", () => {
    expect(toDeleteTargetName(null)).toBe(UNTITLED_FALLBACK);
  });

  it("falls back to UNTITLED_FALLBACK when undefined", () => {
    expect(toDeleteTargetName(undefined)).toBe(UNTITLED_FALLBACK);
  });
});

describe("resolveDeleteTargets", () => {
  it("uses the whole selection when clicked item is inside a multi-select", () => {
    const selected = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    expect(resolveDeleteTargets("b", "B", selected)).toEqual([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);
  });

  it("uses only the clicked item when click lands outside the selection", () => {
    const selected = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    expect(resolveDeleteTargets("c", "C", selected)).toEqual([
      { id: "c", name: "C" },
    ]);
  });

  it("uses only the clicked item when selection has a single matching entry", () => {
    // length > 1 guard: even though clicked id is in selection, size 1 means "not a multi-select".
    expect(resolveDeleteTargets("a", "A", [{ id: "a", name: "A" }])).toEqual([
      { id: "a", name: "A" },
    ]);
  });

  it("uses only the clicked item when selection is empty", () => {
    expect(resolveDeleteTargets("a", "A", [])).toEqual([
      { id: "a", name: "A" },
    ]);
  });

  it("preserves selection-derived names (e.g. Untitled) when using the selection", () => {
    const selected = [
      { id: "a", name: UNTITLED_FALLBACK },
      { id: "b", name: "B" },
    ];
    expect(resolveDeleteTargets("b", "B", selected)).toEqual([
      { id: "a", name: UNTITLED_FALLBACK },
      { id: "b", name: "B" },
    ]);
  });
});

describe("getDeleteDescriptionI18n", () => {
  it("returns singular key + name for one target", () => {
    expect(getDeleteDescriptionI18n([{ id: "a", name: "Doc" }])).toEqual({
      key: "explorer.deleteConfirmation",
      params: { name: "Doc" },
    });
  });

  it("returns plural key + count for multiple targets", () => {
    expect(
      getDeleteDescriptionI18n([
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ])
    ).toEqual({
      key: "explorer.deleteConfirmationMultiple",
      params: { count: 3 },
    });
  });

  it("returns plural key + count=0 for empty targets (no crash)", () => {
    expect(getDeleteDescriptionI18n([])).toEqual({
      key: "explorer.deleteConfirmationMultiple",
      params: { count: 0 },
    });
  });
});
