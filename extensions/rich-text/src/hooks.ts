import { withCollaboration } from "@blocknote/core/yjs";
import { useCreateBlockNote } from "@blocknote/react";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import {
  richTextSchema,
  type RichTextEditorController,
} from "./entity-reference-inline";

export type { RichTextEditorController };

export type RichTextEditorProps = Parameters<typeof useCreateBlockNote>;

export const useYjsRichTextEditor = ({
  yDoc,
  yProvider,
  options,
  user,
  deps = [],
  collaboratorLabel,
}: {
  yDoc: Y.Doc;
  collaboratorLabel: string;
  user: { id?: string; name: string; color: string };
  yProvider?: {
    awareness?: Awareness;
  };
  options?: Omit<RichTextEditorProps[0], "collaboration">;
  deps?: RichTextEditorProps[1];
}): RichTextEditorController =>
  useCreateBlockNote(
    withCollaboration({
      ...options,
      schema: richTextSchema,
      collaboration: {
        provider: yProvider,
        fragment: yDoc.getXmlFragment(),
        user,
        renderCursor: (remote) =>
          renderPresenceCursor(remote, collaboratorLabel),
      },
    }),
    [...deps, yDoc, yProvider]
  ) as RichTextEditorController;

// Use BlockNote cursor classes while keeping anonymous labels localized and text safe.
function renderPresenceCursor(
  user: { name: string; color: string },
  fallback: string
) {
  const base = document.createElement("span");
  base.className = "bn-collaboration-cursor__base";
  const caret = document.createElement("span");
  caret.className = "bn-collaboration-cursor__caret";
  caret.contentEditable = "false";
  const label = document.createElement("span");
  label.className = "bn-collaboration-cursor__label";
  label.textContent = user.name?.trim() || fallback;
  const color = /^#[0-9a-f]{6}$/i.test(user.color) ? user.color : "#1d4ed8";
  for (const element of [caret, label]) {
    element.style.backgroundColor = color;
    element.style.color = "white";
  }
  caret.append(label);
  base.append("\u2060", caret, "\u2060");
  return base;
}
