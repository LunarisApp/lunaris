import { BlockNoteEditor } from "@blocknote/core";
import { blocksToYDoc } from "@blocknote/core/yjs";
import type { Database } from "@repo/data/core";
import {
  createLocalFileWorkspaceResource,
  FILE_ACCEPT,
  FILE_PLUGIN_ID,
  getFileExtension,
} from "@repo/data/features/files";
import { replaceWorkspaceExtensions } from "@repo/data/features/workspace-extensions";
import {
  createWorkspaceFolder,
  createWorkspaceResource,
} from "@repo/data/features/workspace-resources";
import { createWorkspace } from "@repo/data/features/workspaces";
import { b64ToUint8Array } from "@repo/data/features/yjs";
import { log } from "evlog";
import { applyUpdateV2, encodeStateAsUpdateV2 } from "yjs";
import type { ResourceCapacityReservation } from "@repo/features/entitlements";
import type { CreateWorkspaceDialogSchema } from "./types";

export const OBSIDIAN_IMPORT_PLUGIN_IDS = [
  "lunaris.rich-text",
  FILE_PLUGIN_ID,
] as const;

const RICH_TEXT_PLUGIN_ID = "lunaris.rich-text";
const ORIGINAL_FILES_FOLDER_NAME = "Original Files";
const IGNORED_NAMES = new Set([".obsidian", ".git", ".trash"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);
const MIME_IMPORT_EXTENSIONS = new Set(
  FILE_ACCEPT.split(",")
    .filter((entry) => entry.includes("/") && !entry.startsWith("."))
    .map((entry) => getFileExtension(entry, ""))
    .filter(Boolean)
);
const SUPPORTED_IMPORT_EXTENSIONS = new Set(
  [
    ...FILE_ACCEPT.split(",")
      .filter((entry) => entry.startsWith("."))
      .map((entry) => entry.slice(1).toLowerCase()),
    ...MIME_IMPORT_EXTENSIONS,
  ].filter(Boolean)
);

export interface ImportDirectory {
  children: ImportEntry[];
  name: string;
}

export type ImportEntry = ImportFileEntry | ImportFolderEntry;

export interface ImportFileEntry {
  file: File;
  kind: "file";
  name: string;
}

export interface ImportFolderEntry {
  children: ImportEntry[];
  kind: "folder";
  name: string;
}

export interface ObsidianImportStats {
  convertedMarkdownCount: number;
  folderCount: number;
  originalFileCount: number;
  skippedCount: number;
}

interface ImportAccumulator {
  convertedMarkdownCount: number;
  folderCount: number;
  originalFileCount: number;
  skippedCount: number;
}

function updateToBase64(update: Uint8Array) {
  const output: string[] = [];
  for (const byte of update) {
    output.push(String.fromCharCode(byte));
  }
  return btoa(output.join(""));
}

function getExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function stripMarkdownExtension(name: string) {
  return name.replace(/\.(md|markdown)$/i, "");
}

function isIgnoredName(name: string) {
  return name.startsWith(".") || IGNORED_NAMES.has(name.toLowerCase());
}

export function isMarkdownFile(name: string) {
  return MARKDOWN_EXTENSIONS.has(getExtension(name));
}

export function isSupportedImportFile(entry: ImportFileEntry) {
  const nameExtension = getExtension(entry.name);
  const mediaExtension = getFileExtension(entry.file.type, "");
  return (
    isMarkdownFile(entry.name) ||
    SUPPORTED_IMPORT_EXTENSIONS.has(nameExtension) ||
    SUPPORTED_IMPORT_EXTENSIONS.has(mediaExtension)
  );
}

export function getImportStats(
  directory: ImportDirectory
): ObsidianImportStats {
  const stats: ImportAccumulator = {
    convertedMarkdownCount: 0,
    folderCount: 0,
    originalFileCount: 0,
    skippedCount: 0,
  };
  countFilesAndSkipped(directory.children, stats);
  stats.folderCount =
    countWorkingFolders(directory.children) +
    (hasMarkdownDocuments(directory.children)
      ? 1 + countMarkdownFolders(directory.children)
      : 0);
  return stats;
}

function getCreatedResourceCount(stats: ImportAccumulator) {
  return (
    stats.convertedMarkdownCount + stats.folderCount + stats.originalFileCount
  );
}

export function getImportResourceCount(directory: ImportDirectory) {
  return getCreatedResourceCount(getImportStats(directory));
}

function countFilesAndSkipped(
  entries: ImportEntry[],
  stats: ImportAccumulator
) {
  for (const entry of entries) {
    if (isIgnoredName(entry.name)) {
      stats.skippedCount += 1;
      continue;
    }

    if (entry.kind === "folder") {
      countFilesAndSkipped(entry.children, stats);
      continue;
    }

    if (!isSupportedImportFile(entry)) {
      stats.skippedCount += 1;
      continue;
    }

    if (isMarkdownFile(entry.name)) {
      stats.convertedMarkdownCount += 1;
    }
    stats.originalFileCount += 1;
  }
}

function countMarkdownFolders(entries: ImportEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (isIgnoredName(entry.name) || entry.kind !== "folder") {
      continue;
    }
    if (hasMarkdownDocuments(entry.children)) {
      count += 1 + countMarkdownFolders(entry.children);
    }
  }
  return count;
}

function countWorkingFolders(entries: ImportEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (isIgnoredName(entry.name) || entry.kind !== "folder") {
      continue;
    }
    if (hasSupportedWorkingEntries(entry.children)) {
      count += 1 + countWorkingFolders(entry.children);
    }
  }
  return count;
}

export async function createMarkdownRichTextUpdate(markdown: string) {
  const editor = BlockNoteEditor.create();
  try {
    const blocks = editor.tryParseMarkdownToBlocks(markdown);
    const doc = blocksToYDoc(editor, blocks, "");
    return updateToBase64(encodeStateAsUpdateV2(doc));
  } finally {
    editor._tiptapEditor?.destroy();
  }
}

async function createImportedMarkdownItem(params: {
  db: Database;
  entry: ImportFileEntry;
  onItemCreated: () => void;
  parentId: string | null;
  position: number;
  workspaceId: string;
}) {
  const { db, entry, onItemCreated, parentId, position, workspaceId } = params;
  const updateB64 = await createMarkdownRichTextUpdate(await entry.file.text());
  await createWorkspaceResource({
    db,
    name: stripMarkdownExtension(entry.name),
    parentId,
    resourceTypeId: RICH_TEXT_PLUGIN_ID,
    schemaVersion: 1,
    position,
    workspaceId,
    storage: {
      content: {
        kind: "yjs",
        initialize: (doc) => applyUpdateV2(doc, b64ToUint8Array(updateB64)),
      },
    },
  });
  onItemCreated();
}

function hasSupportedWorkingEntries(entries: ImportEntry[]): boolean {
  return entries.some((entry) => {
    if (isIgnoredName(entry.name)) {
      return false;
    }
    if (entry.kind === "folder") {
      return hasSupportedWorkingEntries(entry.children);
    }
    return isSupportedImportFile(entry);
  });
}

function hasMarkdownDocuments(entries: ImportEntry[]): boolean {
  return entries.some((entry) => {
    if (isIgnoredName(entry.name)) {
      return false;
    }
    if (entry.kind === "folder") {
      return hasMarkdownDocuments(entry.children);
    }
    return isMarkdownFile(entry.name);
  });
}

async function importWorkingEntries(params: {
  db: Database;
  entries: ImportEntry[];
  parentId: string | null;
  workspaceId: string;
  stats: ImportAccumulator;
  startPosition?: number;
}) {
  const {
    db,
    entries,
    parentId,
    workspaceId,
    stats,
    startPosition = 0,
  } = params;
  let position = startPosition;

  for (const entry of entries) {
    if (isIgnoredName(entry.name)) {
      stats.skippedCount += 1;
      continue;
    }

    if (entry.kind === "folder") {
      if (!hasSupportedWorkingEntries(entry.children)) {
        continue;
      }
      const folderId = await createWorkspaceFolder({
        db,
        name: entry.name,
        parentId,
        position,
        workspaceId,
      });
      stats.folderCount += 1;
      position += 1;
      await importWorkingEntries({
        db,
        entries: entry.children,
        parentId: folderId,
        workspaceId,
        stats,
      });
      continue;
    }

    if (!isSupportedImportFile(entry)) {
      stats.skippedCount += 1;
      continue;
    }

    if (isMarkdownFile(entry.name)) {
      await createImportedMarkdownItem({
        db,
        entry,
        onItemCreated: () => {
          stats.convertedMarkdownCount += 1;
        },
        parentId,
        position,
        workspaceId,
      });
    } else {
      await createLocalFileWorkspaceResource({
        db,
        file: entry.file,
        parentId,
        position,
        workspaceId,
      });
      stats.originalFileCount += 1;
    }
    position += 1;
  }

  return position;
}

async function importMarkdownSourceEntries(params: {
  db: Database;
  entries: ImportEntry[];
  parentId: string;
  workspaceId: string;
  stats: ImportAccumulator;
}) {
  const { db, entries, parentId, workspaceId, stats } = params;
  let position = 0;

  for (const entry of entries) {
    if (isIgnoredName(entry.name)) {
      continue;
    }

    if (entry.kind === "folder") {
      if (!hasMarkdownDocuments(entry.children)) {
        continue;
      }
      const folderId = await createWorkspaceFolder({
        db,
        name: entry.name,
        parentId,
        position,
        workspaceId,
      });
      stats.folderCount += 1;
      position += 1;
      await importMarkdownSourceEntries({
        db,
        entries: entry.children,
        parentId: folderId,
        workspaceId,
        stats,
      });
      continue;
    }

    if (!isMarkdownFile(entry.name)) {
      continue;
    }

    await createLocalFileWorkspaceResource({
      db,
      file: entry.file,
      parentId,
      position,
      workspaceId,
    });
    stats.originalFileCount += 1;
    position += 1;
  }
}

export async function importObsidianWorkspace(params: {
  allExtensionIds: readonly string[];
  data: CreateWorkspaceDialogSchema;
  db: Database;
  directory: ImportDirectory;
  resourceCapacityReservation: ResourceCapacityReservation;
}) {
  const { allExtensionIds, data, db, directory, resourceCapacityReservation } =
    params;
  const stats: ImportAccumulator = {
    convertedMarkdownCount: 0,
    folderCount: 0,
    originalFileCount: 0,
    skippedCount: 0,
  };

  try {
    const workspaceId = await createWorkspace({ db, ...data });
    const enabledExtensions = OBSIDIAN_IMPORT_PLUGIN_IDS.filter((pluginId) =>
      allExtensionIds.includes(pluginId)
    );
    await replaceWorkspaceExtensions({
      db,
      enabledExtensionIds: enabledExtensions,
      knownExtensionIds: allExtensionIds,
      workspaceId,
    });

    const nextRootPosition = await importWorkingEntries({
      db,
      entries: directory.children,
      parentId: null,
      workspaceId,
      stats,
    });

    if (hasMarkdownDocuments(directory.children)) {
      const originalsFolderId = await createWorkspaceFolder({
        db,
        name: ORIGINAL_FILES_FOLDER_NAME,
        parentId: null,
        position: nextRootPosition,
        workspaceId,
      });
      stats.folderCount += 1;
      await importMarkdownSourceEntries({
        db,
        entries: directory.children,
        parentId: originalsFolderId,
        workspaceId,
        stats,
      });
    }

    log.info({
      tag: "Workspace",
      msg: "obsidian import completed",
      workspace: { id: workspaceId, stats },
    });
    resourceCapacityReservation.commit();
    return { workspaceId, stats };
  } catch (error) {
    resourceCapacityReservation.commit(getCreatedResourceCount(stats));
    resourceCapacityReservation.rollback();
    throw error;
  }
}
