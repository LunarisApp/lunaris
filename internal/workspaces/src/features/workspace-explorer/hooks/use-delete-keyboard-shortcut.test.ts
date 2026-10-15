/** @vitest-environment happy-dom */

import type { ItemInstance, TreeInstance } from "@lunarisapp/ui/components/tree";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode, type RefObject } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HotkeyOverridesProvider } from "@repo/features/hotkeys";
import { UNTITLED_FALLBACK } from "../utils";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(HotkeyOverridesProvider, null, children);

const deleteResourcesMock = vi.fn();
const capturedHotkey = {
  current: null as
    | null
    | {
        handler: () => void;
        key: string;
        options?: Record<string, unknown>;
      },
};

vi.mock("../store", () => ({
  useWorkspaceActions: () => ({
    deleteResources: deleteResourcesMock,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@tanstack/react-hotkeys", () => ({
  HotkeysProvider: ({ children }: { children: unknown }) => children,
  useHotkey: (key: string, handler: () => void, options?: Record<string, unknown>) => {
    capturedHotkey.current = { key, handler, options };
  },
}));

function makeItem(id: string, name: string | null): ItemInstance<WorkspaceResourceEntity> {
  return {
    getId: () => id,
    getItemName: () => name ?? "",
  } as unknown as ItemInstance<WorkspaceResourceEntity>;
}

function makeTree(
  selected: ItemInstance<WorkspaceResourceEntity>[],
  element: HTMLElement | null = null
): TreeInstance<WorkspaceResourceEntity> {
  return {
    getElement: () => element,
    getSelectedItems: () => selected,
  } as unknown as TreeInstance<WorkspaceResourceEntity>;
}

function makeTargetRef(
  element: HTMLElement | null
): RefObject<HTMLDivElement | null> {
  return { current: element } as RefObject<HTMLDivElement | null>;
}

describe("useDeleteKeyboardShortcut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedHotkey.current = null;
    document.body.innerHTML = "";
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "Linux x86_64",
    });
  });

  it("registers delete hotkey on tree target with input ignore enabled", async () => {
    const body = document.createElement("div");
    const treeRoot = document.createElement("div");
    const target = makeTargetRef(body);
    const { useDeleteKeyboardShortcut } = await import("./use-delete-keyboard-shortcut");

    renderHook(() => useDeleteKeyboardShortcut({ target, tree: makeTree([], treeRoot) }), { wrapper });

    expect(capturedHotkey.current).toEqual({
      key: "Delete",
      handler: expect.any(Function),
      options: expect.objectContaining({
        ignoreInputs: true,
        target,
        meta: expect.objectContaining({
          hotkeyId: "delete-resource",
          name: "commands.deleteResource",
        }),
      }),
    });
  });

  it("does not register delete hotkey on document", async () => {
    const body = document.createElement("div");
    const treeRoot = document.createElement("div");
    const target = makeTargetRef(body);
    const { useDeleteKeyboardShortcut } = await import("./use-delete-keyboard-shortcut");

    renderHook(() => useDeleteKeyboardShortcut({ target, tree: makeTree([], treeRoot) }), { wrapper });

    expect(capturedHotkey.current?.options).toEqual(
      expect.objectContaining({ target, ignoreInputs: true })
    );
    expect(capturedHotkey.current?.options).not.toEqual(
      expect.objectContaining({ target: document })
    );
  });

  it("keeps original targets when delete dialog is already open", async () => {
    const body = document.createElement("div");
    const treeRoot = document.createElement("div");
    const treeButton = document.createElement("button");
    body.append(treeRoot);
    treeRoot.append(treeButton);
    document.body.append(body);
    treeButton.focus();

    let selected = [makeItem("a", "Alpha")];
    const tree = {
      getElement: () => treeRoot,
      getSelectedItems: () => selected,
    } as unknown as TreeInstance<WorkspaceResourceEntity>;
    const { useDeleteKeyboardShortcut } = await import("./use-delete-keyboard-shortcut");
    const { result } = renderHook(
      () => useDeleteKeyboardShortcut({ target: makeTargetRef(body), tree }),
      { wrapper }
    );

    act(() => {
      capturedHotkey.current?.handler();
    });

    selected = [makeItem("b", "Beta")];

    act(() => {
      capturedHotkey.current?.handler();
    });

    expect(result.current.confirmDeleteOpen).toBe(true);
    expect(result.current.itemsToDelete).toEqual([{ id: "a", name: "Alpha" }]);
  });

  it("is a no-op when nothing is selected", async () => {
    const body = document.createElement("div");
    const treeRoot = document.createElement("div");
    const treeButton = document.createElement("button");
    body.append(treeRoot);
    treeRoot.append(treeButton);
    document.body.append(body);
    treeButton.focus();

    const tree = makeTree([], treeRoot);
    const { useDeleteKeyboardShortcut } = await import("./use-delete-keyboard-shortcut");
    const { result } = renderHook(
      () => useDeleteKeyboardShortcut({ target: makeTargetRef(body), tree }),
      { wrapper }
    );

    act(() => {
      capturedHotkey.current?.handler();
    });

    expect(result.current.confirmDeleteOpen).toBe(false);
    expect(result.current.itemsToDelete).toEqual([]);
  });

  it("populates a single-target state when one item is selected", async () => {
    const body = document.createElement("div");
    const treeRoot = document.createElement("div");
    const treeButton = document.createElement("button");
    body.append(treeRoot);
    treeRoot.append(treeButton);
    document.body.append(body);
    treeButton.focus();

    const tree = makeTree([makeItem("a", "Alpha")], treeRoot);
    const target = makeTargetRef(body);
    const { useDeleteKeyboardShortcut } = await import("./use-delete-keyboard-shortcut");
    const { result } = renderHook(() => useDeleteKeyboardShortcut({ tree, target }), { wrapper });

    act(() => {
      capturedHotkey.current?.handler();
    });

    expect(result.current.confirmDeleteOpen).toBe(true);
    expect(result.current.itemsToDelete).toEqual([{ id: "a", name: "Alpha" }]);
  });

  it("populates a multi-target state when multiple items are selected", async () => {
    const body = document.createElement("div");
    const treeRoot = document.createElement("div");
    const treeButton = document.createElement("button");
    body.append(treeRoot);
    treeRoot.append(treeButton);
    document.body.append(body);
    treeButton.focus();

    const tree = makeTree(
      [
        makeItem("a", "Alpha"),
        makeItem("b", "Beta"),
        makeItem("c", ""),
      ],
      treeRoot
    );
    const target = makeTargetRef(body);
    const { useDeleteKeyboardShortcut } = await import("./use-delete-keyboard-shortcut");
    const { result } = renderHook(() => useDeleteKeyboardShortcut({ tree, target }), { wrapper });

    act(() => {
      capturedHotkey.current?.handler();
    });

    expect(result.current.confirmDeleteOpen).toBe(true);
    expect(result.current.itemsToDelete).toEqual([
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: UNTITLED_FALLBACK },
    ]);
  });

  it("confirmDelete calls deleteResources with ids and clears state", async () => {
    const body = document.createElement("div");
    const treeRoot = document.createElement("div");
    const treeButton = document.createElement("button");
    body.append(treeRoot);
    treeRoot.append(treeButton);
    document.body.append(body);
    treeButton.focus();

    const tree = makeTree([makeItem("a", "A"), makeItem("b", "B")], treeRoot);
    const target = makeTargetRef(body);
    const { useDeleteKeyboardShortcut } = await import("./use-delete-keyboard-shortcut");
    const { result } = renderHook(() => useDeleteKeyboardShortcut({ tree, target }), { wrapper });

    act(() => {
      capturedHotkey.current?.handler();
    });

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(deleteResourcesMock).toHaveBeenCalledWith(["a", "b"]);
    expect(result.current.confirmDeleteOpen).toBe(false);
    expect(result.current.itemsToDelete).toEqual([]);
  });

  it("handleConfirmDelete is a no-op when itemsToDelete is empty", async () => {
    const body = document.createElement("div");
    const treeRoot = document.createElement("div");
    const treeButton = document.createElement("button");
    body.append(treeRoot);
    treeRoot.append(treeButton);
    document.body.append(body);
    treeButton.focus();

    const tree = makeTree([], treeRoot);
    const target = makeTargetRef(body);
    const { useDeleteKeyboardShortcut } = await import("./use-delete-keyboard-shortcut");
    const { result } = renderHook(() => useDeleteKeyboardShortcut({ tree, target }), { wrapper });

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(deleteResourcesMock).not.toHaveBeenCalled();
  });

  it("is a no-op when live tree element is missing", async () => {
    const body = document.createElement("div");
    const outsideButton = document.createElement("button");
    document.body.append(body, outsideButton);
    outsideButton.focus();

    const { useDeleteKeyboardShortcut } = await import("./use-delete-keyboard-shortcut");
    const { result } = renderHook(
      () =>
        useDeleteKeyboardShortcut({
          target: makeTargetRef(body),
          tree: makeTree([makeItem("a", "Alpha")], null),
        }),
      { wrapper }
    );

    act(() => {
      capturedHotkey.current?.handler();
    });

    expect(result.current.confirmDeleteOpen).toBe(false);
    expect(result.current.itemsToDelete).toEqual([]);
  });

  it("is a no-op when focus is outside live tree", async () => {
    const body = document.createElement("div");
    const treeRoot = document.createElement("div");
    const outsideButton = document.createElement("button");
    body.append(treeRoot);
    document.body.append(body, outsideButton);
    outsideButton.focus();

    const { useDeleteKeyboardShortcut } = await import("./use-delete-keyboard-shortcut");
    const { result } = renderHook(
      () =>
        useDeleteKeyboardShortcut({
          target: makeTargetRef(body),
          tree: makeTree([makeItem("a", "Alpha")], treeRoot),
        }),
      { wrapper }
    );

    act(() => {
      capturedHotkey.current?.handler();
    });

    expect(result.current.confirmDeleteOpen).toBe(false);
    expect(result.current.itemsToDelete).toEqual([]);
  });

  it("uses latest live tree element after remount", async () => {
    const body = document.createElement("div");
    const oldTreeRoot = document.createElement("div");
    const oldTreeButton = document.createElement("button");
    const newTreeRoot = document.createElement("div");
    const newTreeButton = document.createElement("button");
    oldTreeRoot.append(oldTreeButton);
    newTreeRoot.append(newTreeButton);
    body.append(oldTreeRoot);
    document.body.append(body);

    let currentTreeElement: HTMLElement | null = oldTreeRoot;
    const tree = {
      getElement: () => currentTreeElement,
      getSelectedItems: () => [makeItem("a", "Alpha")],
    } as unknown as TreeInstance<WorkspaceResourceEntity>;
    const { useDeleteKeyboardShortcut } = await import("./use-delete-keyboard-shortcut");
    const { result } = renderHook(
      () => useDeleteKeyboardShortcut({ target: makeTargetRef(body), tree }),
      { wrapper }
    );

    body.removeChild(oldTreeRoot);
    body.append(newTreeRoot);
    currentTreeElement = newTreeRoot;
    newTreeButton.focus();

    act(() => {
      capturedHotkey.current?.handler();
    });

    expect(result.current.confirmDeleteOpen).toBe(true);
    expect(result.current.itemsToDelete).toEqual([{ id: "a", name: "Alpha" }]);
  });

  it("passes the provided tree target to TanStack", async () => {
    const treeRoot = document.createElement("div");
    const tree = makeTree([makeItem("a", "Alpha")], treeRoot);
    const target = makeTargetRef(treeRoot);
    const { useDeleteKeyboardShortcut } = await import("./use-delete-keyboard-shortcut");

    renderHook(() => useDeleteKeyboardShortcut({ tree, target }), { wrapper });

    expect(capturedHotkey.current).toEqual({
      key: "Delete",
      handler: expect.any(Function),
      options: expect.objectContaining({
        ignoreInputs: true,
        target,
        meta: expect.objectContaining({
          hotkeyId: "delete-resource",
          name: "commands.deleteResource",
        }),
      }),
    });
  });
});
