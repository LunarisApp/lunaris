import { FILE_ACCEPT, getFileExtension } from "@repo/data/features/files";

export interface ImportDirectory {
  children: ImportEntry[];
  name: string;
  /** Hidden paths excluded before reading their contents. */
  skippedPaths?: string[];
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
export interface ImportOperation {
  file?: File;
  key: string;
  kind: "folder" | "note" | "file" | "source";
  name: string;
  parentKey: string | null;
  path: string;
  position: number;
}
export interface ObsidianImportPlan {
  keepOriginals: boolean;
  operations: ImportOperation[];
  resourceCount: number;
  retainedFileBytes: number;
  skipped: { path: string; reason: "hidden" | "unsupported" }[];
  /** Bytes of source files selected for import, before rich-text encoding. */
  sourceBytes: number;
  stats: ObsidianImportStats;
}
const SUPPORTED_EXTENSIONS = new Set([
  "jpeg",
  ...FILE_ACCEPT.split(",").map((entry) =>
    entry.startsWith(".") ? entry.slice(1) : getFileExtension(entry, "")
  ),
]);
export function isIgnoredName(name: string) {
  return name.startsWith(".");
}
export function isMarkdownFile(name: string) {
  return /\.(md|markdown)$/i.test(name);
}
export function isSupportedImportFile(entry: ImportFileEntry) {
  return (
    isMarkdownFile(entry.name) ||
    SUPPORTED_EXTENSIONS.has(
      entry.name.split(".").pop()?.toLowerCase() ?? ""
    ) ||
    SUPPORTED_EXTENSIONS.has(getFileExtension(entry.file.type, ""))
  );
}

/** One bottom-up walk supplies preview, quota, execution, and the final report. */
export function createObsidianImportPlan(
  directory: ImportDirectory,
  keepOriginals = true
): ObsidianImportPlan {
  const operations: ImportOperation[] = [];
  const sources: ImportOperation[] = [];
  const skipped: ObsidianImportPlan["skipped"] = (
    directory.skippedPaths ?? []
  ).map((path) => ({ path, reason: "hidden" }));
  let sourceBytes = 0;
  let retainedFileBytes = 0;
  function walk(
    entries: ImportEntry[],
    parentPath: string,
    parentKey: string | null,
    sourceParent: string
  ) {
    let position = 0;
    let sourcePosition = 0;
    for (const entry of entries) {
      const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      if (isIgnoredName(entry.name)) {
        skipped.push({ path, reason: "hidden" });
        continue;
      }
      const key = `working:${path}`;
      const sourceKey = `source:${path}`;
      if (entry.kind === "folder") {
        const workingIndex = operations.length;
        const sourceIndex = sources.length;
        walk(entry.children, path, key, sourceKey);
        if (operations.length > workingIndex) {
          operations.splice(workingIndex, 0, {
            key,
            path,
            parentKey,
            name: entry.name,
            position: position++,
            kind: "folder",
          });
        }
        if (sources.length > sourceIndex) {
          sources.splice(sourceIndex, 0, {
            key: sourceKey,
            path,
            parentKey: sourceParent,
            name: entry.name,
            position: sourcePosition++,
            kind: "folder",
          });
        }
      } else if (isSupportedImportFile(entry)) {
        const markdown = isMarkdownFile(entry.name);
        sourceBytes += entry.file.size;
        operations.push({
          key,
          path,
          parentKey,
          name: markdown
            ? entry.name.replace(/\.(md|markdown)$/i, "")
            : entry.name,
          position: position++,
          kind: markdown ? "note" : "file",
          file: entry.file,
        });
        if (!markdown || keepOriginals) {
          retainedFileBytes += entry.file.size;
        }
        if (markdown && keepOriginals) {
          sources.push({
            key: sourceKey,
            path,
            parentKey: sourceParent,
            name: entry.name,
            position: sourcePosition++,
            kind: "source",
            file: entry.file,
          });
        }
      } else {
        skipped.push({ path, reason: "unsupported" });
      }
    }
    return position;
  }
  const rootPosition = walk(directory.children, "", null, "originals");
  if (sources.length) {
    operations.push(
      {
        key: "originals",
        path: "Original Files",
        parentKey: null,
        name: "Original Files",
        position: rootPosition,
        kind: "folder",
      },
      ...sources
    );
  }
  const stats = {
    convertedMarkdownCount: 0,
    folderCount: 0,
    originalFileCount: 0,
    skippedCount: skipped.length,
  };
  for (const operation of operations) {
    if (operation.kind === "folder") {
      stats.folderCount++;
    } else if (operation.kind === "note") {
      stats.convertedMarkdownCount++;
    } else {
      stats.originalFileCount++;
    }
  }
  return {
    operations,
    skipped,
    stats,
    resourceCount: operations.length,
    sourceBytes,
    retainedFileBytes,
    keepOriginals,
  };
}
export function getImportStats(
  directory: ImportDirectory,
  keepOriginals = true
) {
  return createObsidianImportPlan(directory, keepOriginals).stats;
}
export function getImportResourceCount(
  directory: ImportDirectory,
  keepOriginals = true
) {
  return createObsidianImportPlan(directory, keepOriginals).resourceCount;
}
