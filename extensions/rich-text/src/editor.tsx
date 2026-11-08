import { BlockNoteView } from "@blocknote/shadcn";
import { EntityReferenceSuggestionMenu } from "./entity-reference-inline";
import type { RichTextEditorController } from "./hooks";

import "@blocknote/shadcn/style.css";
import "@blocknote/core/fonts/inter.css";
import "./styles.css";

export function RichTextEditorView({
  controller,
  editable,
  theme,
  className,
  resourceId,
}: {
  controller: RichTextEditorController;
  editable?: boolean;
  theme?: "light" | "dark";
  className?: string;
  resourceId?: string;
}) {
  return (
    <div
      className={`rich-text-editor-view ${className ?? ""}`}
      data-lunaris-rich-text-resource={resourceId}
    >
      <BlockNoteView editable={editable} editor={controller} theme={theme}>
        {editable ? (
          <EntityReferenceSuggestionMenu controller={controller} />
        ) : null}
      </BlockNoteView>
    </div>
  );
}
