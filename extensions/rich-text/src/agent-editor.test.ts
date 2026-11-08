import { describe, expect, it, vi } from "vitest";
import type { RichTextEditorController } from "./hooks";
import {
  captureAgentEditorSelection,
  registerAgentEditor,
} from "./agent-editor";

function setup() {
  const dom = document.createElement("div");
  dom.textContent = "Hello";
  document.body.append(dom);
  const range = document.createRange();
  range.selectNodeContents(dom);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
  const doc = {
    type: { schema: { marks: { bold: { create: () => "bold" } } } },
  };
  const transaction = {
    doc,
    insertText: vi.fn(),
    addMark: vi.fn(),
    removeMark: vi.fn(),
  };
  const state = {
    doc,
    selection: {
      empty: false,
      getBookmark: () => ({ resolve: () => ({ from: 2, to: 7 }) }),
    },
  };
  const controller = {
    domElement: dom,
    prosemirrorState: state,
    transact: (apply: (value: typeof transaction) => void) =>
      apply(transaction),
  } as unknown as RichTextEditorController;
  const cleanup = registerAgentEditor("resource-1", controller, true);
  return {
    cleanup: () => {
      cleanup();
      dom.remove();
    },
    state,
    doc,
    transaction,
  };
}
describe("agent editor bookmarks", () => {
  it("edits the captured range after browser focus moves and rejects stale content", () => {
    const editor = setup();
    try {
      const snapshot = captureAgentEditorSelection("resource-1", document)!;
      document.getSelection()!.removeAllRanges();
      snapshot.apply({ text: "Changed" });
      expect(editor.transaction.insertText).toHaveBeenCalledWith(
        "Changed",
        2,
        7
      );
      editor.state.doc = { ...editor.doc };
      expect(() => snapshot.apply({ text: "Again" })).toThrow(
        "content changed"
      );
    } finally {
      editor.cleanup();
    }
  });
  it("formats only the captured range and rejects unmounted editors", () => {
    const editor = setup();
    const snapshot = captureAgentEditorSelection("resource-1", document)!;
    snapshot.apply({ format: "bold", enabled: true });
    expect(editor.transaction.addMark).toHaveBeenCalledWith(2, 7, "bold");
    editor.cleanup();
    expect(() => snapshot.apply({ text: "After closing" })).toThrow();
  });
});
