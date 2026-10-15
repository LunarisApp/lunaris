import { BlockNoteEditor } from "@blocknote/core";
import { blocksToYDoc, yDocToBlocks } from "@blocknote/core/yjs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  EntityReferenceInlineContent,
  EntityReferenceSuggestionMenuContent,
  entityReferenceOptionToInlineContent,
  entityReferenceOptionToSuggestionItem,
  richTextSchema,
  type RichTextEditorController,
} from "./entity-reference-inline";

const translations: Record<string, string> = {
  ariaLabel: "Workspaces, folders, and items",
  close: "close",
  description: "Workspaces, folders, and items",
  folder: "Folder",
  item: "Workspace item",
  navigate: "navigate",
  noResultsDescription: "Try another workspace, folder, or item name.",
  noResultsTitle: "No matches",
  workspace: "Workspace",
  resource: "Resource",
  searching: "Searching",
  select: "select",
  title: "Mention",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key.split(".").at(-1) ?? ""] ?? key,
  }),
}));

const navigation = vi.hoisted(() => ({
  openEntityReference: vi.fn().mockResolvedValue(true),
}));

vi.mock("@lunarisapp/plugin-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lunarisapp/plugin-sdk")>()),
  useCurrentWorkspace: () => ({ workspaceId: "workspace_1" }),
  useOrganizationNavigation: () => navigation,
}));

const option = {
  kind: "resource" as const,
  name: "Launch plan",
  resourceTypeId: "lunaris.rich-text",
  storage: {
    content: { kind: "yjs" as const, storageId: "storage_1" },
  },
  workspaceName: "Launch",
  reference: {
    resourceId: "item_1",
    workspaceId: "workspace_1",
    type: "workspace-resource" as const,
  },
};

it("inserts an atomic entity reference instead of a link", () => {
  const insertInlineContent = vi.fn();
  const item = entityReferenceOptionToSuggestionItem(
    { insertInlineContent } as unknown as RichTextEditorController,
    option
  );

  item.onItemClick();

  expect(insertInlineContent).toHaveBeenCalledWith([
    {
      props: {
        resourceId: "item_1",
        kind: "resource",
        name: "Launch plan",
        workspaceId: "workspace_1",
      },
      type: "entityReference",
    },
    " ",
  ]);
  expect(item.title).toBe("Launch plan");
});

it("renders a structured, selectable mention menu", () => {
  const item = entityReferenceOptionToSuggestionItem(
    { insertInlineContent: vi.fn() } as unknown as RichTextEditorController,
    option
  );
  const onItemClick = vi.fn();

  render(
    <EntityReferenceSuggestionMenuContent
      items={[item]}
      loadingState="loaded"
      onItemClick={onItemClick}
      selectedIndex={0}
    />
  );

  expect(
    screen.getByRole("listbox", { name: "Workspaces, folders, and items" })
  ).toBeTruthy();
  expect(screen.getByText("Mention")).toBeTruthy();
  expect(screen.getByText("Launch · Resource")).toBeTruthy();

  const result = screen.getByRole("option", { name: /Launch plan/u });
  expect(result.getAttribute("aria-selected")).toBe("true");
  fireEvent.click(result);
  expect(onItemClick).toHaveBeenCalledWith(item);
});

it("renders polished loading and empty mention states", () => {
  const { rerender } = render(
    <EntityReferenceSuggestionMenuContent
      items={[]}
      loadingState="loading-initial"
      selectedIndex={undefined}
    />
  );

  expect(screen.getByRole("status").textContent).toContain("Searching");

  rerender(
    <EntityReferenceSuggestionMenuContent
      items={[]}
      loadingState="loaded"
      selectedIndex={undefined}
    />
  );

  expect(screen.getByText("No matches")).toBeTruthy();
  expect(
    screen.getByText("Try another workspace, folder, or item name.")
  ).toBeTruthy();
});

it("persists entity references through Yjs without producing hrefs", () => {
  const editor = BlockNoteEditor.create({
    schema: richTextSchema,
  });
  const inlineContent = entityReferenceOptionToInlineContent(option);
  const blocks = [{ content: [inlineContent], type: "paragraph" as const }];

  let html = "";
  let persistedBlocks: { content?: unknown }[] = [];
  act(() => {
    html = editor.blocksToHTMLLossy(blocks);
    persistedBlocks = yDocToBlocks(
      editor,
      blocksToYDoc(editor, blocks, ""),
      ""
    ) as { content?: unknown }[];
  });
  editor._tiptapEditor?.destroy();

  expect(html).toContain("data-lunaris-entity-reference");
  expect(html).toContain("@Launch plan");
  expect(html).not.toContain("href=");
  expect(persistedBlocks[0]?.content).toEqual([inlineContent]);
});

it("exports a readable text fallback", () => {
  const editor = BlockNoteEditor.create({
    schema: richTextSchema,
  });

  let markdown = "";
  act(() => {
    markdown = editor.blocksToMarkdownLossy([
      {
        content: [entityReferenceOptionToInlineContent(option)],
        type: "paragraph",
      },
    ]);
  });
  editor._tiptapEditor?.destroy();

  expect(markdown.trim()).toBe("@Launch plan");
});

it("opens content through its stable native reference", () => {
  render(
    <EntityReferenceInlineContent
      inlineContent={entityReferenceOptionToInlineContent(option)}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Launch plan" }));

  expect(navigation.openEntityReference).toHaveBeenCalledWith({
    resourceId: "item_1",
    workspaceId: "workspace_1",
    type: "workspace-resource",
  });
});
