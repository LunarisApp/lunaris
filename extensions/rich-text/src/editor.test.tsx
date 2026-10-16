import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditorView } from "./editor";
import type { RichTextEditorController } from "./hooks";

vi.mock("@blocknote/shadcn", () => ({
  BlockNoteView: ({ className }: ComponentProps<"div">) => (
    <div className={className} data-testid="blocknote-view" />
  ),
}));

vi.mock("./entity-reference-inline", () => ({
  EntityReferenceSuggestionMenu: () => null,
}));

describe("RichTextEditorView", () => {
  it("keeps layout classes off BlockNoteView so portal root does not overflow", () => {
    render(
      <RichTextEditorView
        className="h-full p-3.5"
        controller={{} as RichTextEditorController}
        theme="dark"
      />
    );

    const blockNoteView = screen.getByTestId("blocknote-view");

    expect(blockNoteView.classList.contains("h-full")).toBe(false);
    expect(blockNoteView.classList.contains("p-3.5")).toBe(false);
    expect(blockNoteView.parentElement?.classList.contains("h-full")).toBe(
      true
    );
    expect(blockNoteView.parentElement?.classList.contains("p-3.5")).toBe(true);
  });
});
