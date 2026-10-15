/** @vitest-environment happy-dom */

import type { ItemInstance, TreeInstance } from "@lunarisapp/ui/components/tree";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useResourceClipboardShortcuts } from "./use-resource-clipboard-shortcuts";

const duplicateItemMock = vi.fn();
const capturedHotkeys: Array<{
  handler: () => void | Promise<void>;
  key: string;
  options?: Record<string, unknown>;
}> = [];

vi.mock("../store", () => ({
  useWorkspaceActions: () => ({ duplicateResource: duplicateItemMock }),
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({
  useResourceTypes: () => [
    {
      resourceTypeId: "lunaris.rich-text",
      storage: { content: { kind: "yjs" } },
    },
    {
      resourceTypeId: "lunaris.file",
      storage: { content: { kind: "file" } },
    },
  ],
}));

vi.mock("@repo/features/hotkeys", () => ({
  createHotkeyOptions: (
    _hotkey: unknown,
    _t: unknown,
    options: Record<string, unknown>
  ) => options,
  HOTKEYS: {
    "copy-resources": { key: "Mod+C" },
    "paste-resources": { key: "Mod+V" },
  },
  useResolvedHotkeyBinding: (hotkey: { key: string }) => hotkey.key,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "common.copy": "(Copy)",
        "common.untitled": "Untitled",
      })[key] ?? key,
  }),
}));

vi.mock("@tanstack/react-hotkeys", () => ({
  useHotkey: (
    key: string,
    handler: () => void | Promise<void>,
    options?: Record<string, unknown>
  ) => capturedHotkeys.push({ handler, key, options }),
}));

function makeItem(
  id: string,
  resourceTypeId: string | null,
): ItemInstance<WorkspaceResourceEntity> {
  return {
    getId: () => id,
    getItemData: () => ({
      resource_type_id: resourceTypeId,
    }),
  } as unknown as ItemInstance<WorkspaceResourceEntity>;
}

describe("useResourceClipboardShortcuts", () => {
  beforeEach(() => {
    capturedHotkeys.length = 0;
    duplicateItemMock.mockReset().mockResolvedValue(undefined);
  });

  it("registers tree-scoped copy and paste hotkeys", () => {
    const target = { current: document.createElement("div") } as RefObject<
      HTMLDivElement | null
    >;
    const tree = {
      getSelectedItems: () => [],
    } as unknown as TreeInstance<WorkspaceResourceEntity>;

    renderHook(() => useResourceClipboardShortcuts({ target, tree }));

    expect(capturedHotkeys).toEqual([
      expect.objectContaining({
        key: "Mod+C",
        options: expect.objectContaining({
          ignoreInputs: true,
          preventDefault: true,
          target,
        }),
      }),
      expect.objectContaining({
        key: "Mod+V",
        options: expect.objectContaining({
          ignoreInputs: true,
          preventDefault: true,
          target,
        }),
      }),
    ]);
  });

  it("copies typed resources without legacy document IDs", async () => {
    const tree = {
      getSelectedItems: () => [
        makeItem("item_1", "lunaris.rich-text"),
        makeItem("file_1", "lunaris.file"),
        makeItem("folder_1", "lunaris.folder"),
      ],
    } as unknown as TreeInstance<WorkspaceResourceEntity>;

    renderHook(
      () =>
        useResourceClipboardShortcuts({
          target: { current: document.createElement("div") },
          tree,
        })
    );

    act(() => capturedHotkeys.find(({ key }) => key === "Mod+C")?.handler());
    await act(async () => {
      await capturedHotkeys.find(({ key }) => key === "Mod+V")?.handler();
    });

    expect(duplicateItemMock).toHaveBeenCalledOnce();
    expect(duplicateItemMock).toHaveBeenCalledWith("item_1", {
      copyLabel: "(Copy)",
      trigger: "clipboard",
      untitledLabel: "Untitled",
    });
  });
});
