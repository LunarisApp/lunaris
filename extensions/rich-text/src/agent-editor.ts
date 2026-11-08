import type { RichTextEditorController } from "./hooks";

export type SelectionEdit =
  | { text: string }
  | { format: "bold" | "italic" | "underline" | "strike"; enabled: boolean };

const editors = new Map<
  string,
  Set<{ controller: RichTextEditorController; editable: boolean }>
>();

export function registerAgentEditor(
  resourceId: string,
  controller: RichTextEditorController,
  editable: boolean
) {
  const entries = editors.get(resourceId) ?? new Set();
  const entry = { controller, editable };
  entries.add(entry);
  editors.set(resourceId, entries);
  return () => {
    entries.delete(entry);
    if (!entries.size) {
      editors.delete(resourceId);
    }
  };
}

/** A bookmark is valid only against the exact immutable document it came from. */
export function captureAgentEditorSelection(
  resourceId: string,
  target: Document
) {
  const selection = target.getSelection();
  if (!selection || selection.isCollapsed) {
    return null;
  }
  const entry = Array.from(editors.get(resourceId) ?? []).find(
    ({ controller }) =>
      controller.domElement?.contains(selection.anchorNode) &&
      controller.domElement?.contains(selection.focusNode)
  );
  if (!entry) {
    return null;
  }
  const { controller } = entry;
  const state = controller.prosemirrorState;
  if (state.selection.empty) {
    return null;
  }
  const doc = state.doc;
  const bookmark = state.selection.getBookmark();
  return {
    apply: (edit: SelectionEdit) => {
      if (
        !(entry.editable && editors.get(resourceId)?.has(entry)) ||
        controller.prosemirrorState.doc !== doc
      ) {
        throw new Error(
          "Editor content changed or is read-only. Read the selection again."
        );
      }
      controller.transact((transaction) => {
        if (transaction.doc !== doc) {
          throw new Error("Editor content changed. Read the selection again.");
        }
        const { from, to } = bookmark.resolve(transaction.doc);
        if ("text" in edit) {
          transaction.insertText(edit.text, from, to);
        } else {
          const mark = transaction.doc.type.schema.marks[edit.format];
          if (!mark) {
            throw new Error("Unsupported selection format.");
          }
          if (edit.enabled) {
            transaction.addMark(from, to, mark.create());
          } else {
            transaction.removeMark(from, to, mark);
          }
        }
      });
    },
  };
}
