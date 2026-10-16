/** @vitest-environment happy-dom */

import { BlockNoteEditor } from "@blocknote/core";
import { yXmlFragmentToBlocks } from "@blocknote/core/yjs";
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyUpdateV2, Doc } from "yjs";
import {
  createMarkdownRichTextUpdate,
  getImportResourceCount,
  getImportStats,
  type ImportDirectory,
  importObsidianWorkspace,
} from "./obsidian-import-service";

const {
  createLocalFileWorkspaceResourceMock,
  replaceWorkspaceExtensionsMock,
  createWorkspaceFolderMock,
  createWorkspaceResourceMock,
  createWorkspaceMock,
  insertYjsDocumentUpdateMock,
} = vi.hoisted(() => ({
  createLocalFileWorkspaceResourceMock: vi.fn(),
  replaceWorkspaceExtensionsMock: vi.fn(),
  createWorkspaceFolderMock: vi.fn(),
  createWorkspaceResourceMock: vi.fn(),
  createWorkspaceMock: vi.fn(),
  insertYjsDocumentUpdateMock: vi.fn(),
}));

vi.mock("@repo/data/features/files", () => ({
  FILE_ACCEPT:
    "application/pdf,image/png,text/markdown,text/plain,.png,.md,.markdown,.txt",
  FILE_PLUGIN_ID: "lunaris.file",
  getFileExtension: (mediaType: string, filename: string) => {
    const mapped: Record<string, string> = {
      "application/pdf": "pdf",
      "image/png": "png",
      "text/markdown": "md",
      "text/plain": "txt",
    };
    return (
      mapped[mediaType] ?? filename.split(".").pop()?.toLowerCase() ?? "bin"
    );
  },
  createLocalFileWorkspaceResource: createLocalFileWorkspaceResourceMock,
}));

vi.mock("@repo/data/features/workspace-extensions", () => ({
  replaceWorkspaceExtensions: replaceWorkspaceExtensionsMock,
}));

vi.mock("@repo/data/features/workspace-resources", () => ({
  createWorkspaceFolder: createWorkspaceFolderMock,
  createWorkspaceResource: createWorkspaceResourceMock,
}));

vi.mock("@repo/data/features/workspaces", () => ({
  createWorkspace: createWorkspaceMock,
}));

vi.mock("@repo/data/features/yjs", () => ({
  b64ToUint8Array: decodeBase64,
  insertYjsDocumentUpdate: insertYjsDocumentUpdateMock,
}));

vi.mock("evlog", () => ({
  log: { info: vi.fn() },
}));

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

beforeEach(() => {
  vi.clearAllMocks();
  createWorkspaceMock.mockResolvedValue("workspace_1");
  createWorkspaceFolderMock.mockImplementation(
    ({ name, parentId }: { name: string; parentId: string | null }) =>
      Promise.resolve(
        name === "Original Files"
          ? "folder_originals"
          : name === "Drafts" && parentId === "folder_originals"
            ? "folder_originals_drafts"
            : "folder_drafts"
      )
  );
  createWorkspaceResourceMock.mockResolvedValue({
    id: "item_intro",
    documentId: "yjs_intro",
  });
  replaceWorkspaceExtensionsMock.mockResolvedValue(undefined);
  insertYjsDocumentUpdateMock.mockResolvedValue(undefined);
  createLocalFileWorkspaceResourceMock.mockResolvedValue({ id: "file_1" });
});

describe("obsidian import service", () => {
  it("creates BlockNote-readable Yjs updates from Markdown", async () => {
    const update = await createMarkdownRichTextUpdate(
      "# Hello\n\nBody **text**"
    );
    const doc = new Doc();
    applyUpdateV2(doc, decodeBase64(update));

    const editor = BlockNoteEditor.create();
    const blocks = yXmlFragmentToBlocks(editor, doc.getXmlFragment());
    editor._tiptapEditor?.destroy();

    expect(decodeBase64(update).byteLength).toBeGreaterThan(0);
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.content).toEqual([
      { type: "text", text: "Hello", styles: {} },
    ]);
  });

  it("keeps converted Markdown and non-Markdown files in the main tree with Markdown sources under originals", async () => {
    const directory: ImportDirectory = {
      name: "Vault",
      children: [
        { kind: "folder", name: ".obsidian", children: [] },
        {
          kind: "folder",
          name: "Drafts",
          children: [
            {
              kind: "file",
              name: "Intro.md",
              file: new File(["# Intro"], "Intro.md", {
                type: "text/markdown",
              }),
            },
            {
              kind: "file",
              name: "Cover.png",
              file: new File(["png"], "Cover.png", { type: "image/png" }),
            },
          ],
        },
        {
          kind: "file",
          name: "Brief.pdf",
          file: new File(["pdf"], "Brief.pdf", { type: "application/pdf" }),
        },
        {
          kind: "file",
          name: ".secret.md",
          file: new File(["secret"], ".secret.md", { type: "text/markdown" }),
        },
        {
          kind: "file",
          name: "Raw.exe",
          file: new File(["exe"], "Raw.exe", {
            type: "application/octet-stream",
          }),
        },
      ],
    };

    expect(getImportStats(directory)).toEqual({
      convertedMarkdownCount: 1,
      folderCount: 3,
      originalFileCount: 3,
      skippedCount: 3,
    });
    expect(getImportResourceCount(directory)).toBe(7);

    const resourceCapacityReservation = {
      commit: vi.fn(),
      rollback: vi.fn(),
    };

    const result = await importObsidianWorkspace({
      allExtensionIds: ["lunaris.rich-text", "lunaris.file"],
      data: {
        name: "Vault",
        organizationId: "org_1",
        slug: "vault",
        visibility: WORKSPACE_VISIBILITY.local,
      },
      db: {} as never,
      directory,
      resourceCapacityReservation,
    });

    expect(createWorkspaceMock).toHaveBeenCalledWith({
      db: {},
      name: "Vault",
      organizationId: "org_1",
      slug: "vault",
      visibility: WORKSPACE_VISIBILITY.local,
    });
    expect(replaceWorkspaceExtensionsMock).toHaveBeenCalledWith({
      db: expect.anything(),
      enabledExtensionIds: ["lunaris.rich-text", "lunaris.file"],
      knownExtensionIds: expect.any(Array),
      workspaceId: "workspace_1",
    });
    expect(createWorkspaceFolderMock).toHaveBeenNthCalledWith(1, {
      db: {},
      name: "Drafts",
      parentId: null,
      position: 0,
      workspaceId: "workspace_1",
    });
    expect(createWorkspaceFolderMock).toHaveBeenNthCalledWith(2, {
      db: {},
      name: "Original Files",
      parentId: null,
      position: 2,
      workspaceId: "workspace_1",
    });
    expect(createWorkspaceFolderMock).toHaveBeenNthCalledWith(3, {
      db: {},
      name: "Drafts",
      parentId: "folder_originals",
      position: 0,
      workspaceId: "workspace_1",
    });
    expect(createWorkspaceResourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        db: {},
        name: "Intro",
        parentId: "folder_drafts",
        resourceTypeId: "lunaris.rich-text",
        schemaVersion: 1,
        position: 0,
        workspaceId: "workspace_1",
      })
    );
    expect(createLocalFileWorkspaceResourceMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        parentId: "folder_drafts",
        position: 1,
        workspaceId: "workspace_1",
      })
    );
    expect(createLocalFileWorkspaceResourceMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        parentId: null,
        position: 1,
        workspaceId: "workspace_1",
      })
    );
    expect(createLocalFileWorkspaceResourceMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        parentId: "folder_originals_drafts",
        position: 0,
        workspaceId: "workspace_1",
      })
    );
    const initialize = createWorkspaceResourceMock.mock.calls[0]?.[0]?.storage
      ?.content?.initialize as ((doc: Doc) => void) | undefined;
    expect(initialize).toBeTypeOf("function");
    const importedDoc = new Doc();
    initialize?.(importedDoc);
    const editor = BlockNoteEditor.create();
    const blocks = yXmlFragmentToBlocks(editor, importedDoc.getXmlFragment());
    editor._tiptapEditor?.destroy();
    expect(blocks[0]?.type).toBe("heading");
    expect(result.stats).toEqual({
      convertedMarkdownCount: 1,
      folderCount: 3,
      originalFileCount: 3,
      skippedCount: 3,
    });
    expect(resourceCapacityReservation.commit).toHaveBeenCalledWith();
    expect(resourceCapacityReservation.rollback).not.toHaveBeenCalled();
  });

  it("records imported items and releases unused capacity on failure", async () => {
    const error = new Error("markdown failed");
    const resourceCapacityReservation = {
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    createWorkspaceResourceMock.mockRejectedValueOnce(error);

    await expect(
      importObsidianWorkspace({
        allExtensionIds: ["lunaris.rich-text", "lunaris.file"],
        data: {
          name: "Vault",
          organizationId: "org_1",
          slug: "vault",
          visibility: WORKSPACE_VISIBILITY.local,
        },
        db: {} as never,
        directory: {
          name: "Vault",
          children: [
            {
              children: [
                {
                  file: new File(["# Intro"], "Intro.md", {
                    type: "text/markdown",
                  }),
                  kind: "file",
                  name: "Intro.md",
                },
              ],
              kind: "folder",
              name: "Drafts",
            },
          ],
        },
        resourceCapacityReservation,
      })
    ).rejects.toBe(error);

    expect(resourceCapacityReservation.commit).toHaveBeenCalledWith(1);
    expect(resourceCapacityReservation.rollback).toHaveBeenCalledOnce();
  });
});
