import { BlockNoteEditor } from "@blocknote/core";
import { blocksToYXmlFragment } from "@blocknote/core/yjs";
import type {
  PluginResourceData,
  PluginResourceReadContext,
} from "@lunarisapp/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { Doc, encodeStateAsUpdateV2 } from "yjs";
import { richTextHeadlessSchema } from "./entity-reference-schema";
import { compileBlockNoteBlocks } from "./yjs-compile";

function context(
  updates: string[],
  hasStorage = true
): PluginResourceReadContext {
  return {
    getWorkspaceResource: vi.fn(
      async (): Promise<PluginResourceData> => ({
        resourceId: "resource-1",
        resourceTypeId: "lunaris.rich-text",
        schemaVersion: 1,
        name: "Notes",
        parentId: null,
        position: null,
        createdAt: null,
        updatedAt: null,
        storage: hasStorage
          ? { content: { kind: "yjs" as const, storageId: "storage-1" } }
          : {},
      })
    ),
    getWorkspaceResourceChildren: vi.fn(async () => []),
    getYjsStorageUpdates: vi.fn(async () =>
      updates.map((updateBase64) => ({ updateBase64 }))
    ),
    resolveResource: vi.fn(async () => ({ status: "ready" as const })),
  };
}

describe("BlockNote block compilation", () => {
  it("reads persisted Yjs content with inline styles and resource mentions", async () => {
    const editor = BlockNoteEditor.create({
      schema: richTextHeadlessSchema,
      initialContent: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Latest saved edit", styles: { bold: true } },
            { type: "entityReference", props: { name: "Linked resource" } },
          ],
        },
      ],
    });
    const doc = new Doc();
    try {
      blocksToYXmlFragment(editor, editor.document, doc.getXmlFragment());
      const bytes = encodeStateAsUpdateV2(doc);
      const reader = context([btoa(String.fromCharCode(...bytes))]);
      const result = await compileBlockNoteBlocks(reader, "resource-1");
      expect(result[0]?.content).toEqual(editor.document[0]?.content);
      expect(reader.getYjsStorageUpdates).toHaveBeenCalledWith({
        kind: "yjs",
        storageId: "storage-1",
      });
    } finally {
      editor._tiptapEditor.destroy();
      doc.destroy();
    }
  });

  it("returns no blocks for missing storage or updates", async () => {
    await expect(
      compileBlockNoteBlocks(context([], false), "resource-1")
    ).resolves.toEqual([]);
    await expect(
      compileBlockNoteBlocks(context([]), "resource-1")
    ).resolves.toEqual([]);
  });

  it("propagates invalid Yjs updates", async () => {
    await expect(
      compileBlockNoteBlocks(context(["not base64!"]), "resource-1")
    ).rejects.toThrow();
  });
});
