import {
  isIgnoredName,
  type ImportDirectory,
  type ImportEntry,
} from "./obsidian-import-plan";

interface NativeFileHandle {
  getFile: () => Promise<File>;
  kind: "file";
  name: string;
}

interface NativeDirectoryHandle {
  entries: () => AsyncIterableIterator<[string, NativeHandle]>;
  kind: "directory";
  name: string;
}

type NativeHandle = NativeDirectoryHandle | NativeFileHandle;

type DirectoryPickerWindow = Window &
  typeof globalThis & {
    showDirectoryPicker?: () => Promise<NativeDirectoryHandle>;
  };

type WebkitDirectoryFile = File & {
  webkitRelativePath?: string;
};

function sortEntries(entries: ImportEntry[]) {
  return entries.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

async function directoryHandleToImportDirectory(
  handle: NativeDirectoryHandle
): Promise<ImportDirectory> {
  const skippedPaths: string[] = [];
  const children = sortEntries(
    await readDirectoryEntries(handle, skippedPaths)
  );
  return { name: handle.name, children, skippedPaths };
}

async function readDirectoryEntries(
  handle: NativeDirectoryHandle,
  skippedPaths: string[],
  parentPath = ""
): Promise<ImportEntry[]> {
  const entries: ImportEntry[] = [];

  for await (const [, child] of handle.entries()) {
    const path = parentPath ? `${parentPath}/${child.name}` : child.name;
    if (isIgnoredName(child.name)) {
      skippedPaths.push(path);
      continue;
    }
    if (child.kind === "directory") {
      entries.push({
        kind: "folder",
        name: child.name,
        children: sortEntries(
          await readDirectoryEntries(child, skippedPaths, path)
        ),
      });
      continue;
    }

    entries.push({
      kind: "file",
      name: child.name,
      file: await child.getFile(),
    });
  }

  return entries;
}

function addFileToTree(root: ImportDirectory, file: WebkitDirectoryFile) {
  const parts = (file.webkitRelativePath || file.name)
    .split("/")
    .filter(Boolean);
  if (parts.length === 0) {
    return;
  }

  root.name = root.name || parts[0] || "Imported Workspace";
  const ignoredIndex = parts.findIndex(
    (part, index) => index > 0 && isIgnoredName(part)
  );
  if (ignoredIndex >= 0) {
    const path = parts.slice(1, ignoredIndex + 1).join("/");
    root.skippedPaths ??= [];
    if (!root.skippedPaths.includes(path)) {
      root.skippedPaths.push(path);
    }
    return;
  }
  let children = root.children;

  for (const folderName of parts.slice(1, -1)) {
    let folder = children.find(
      (entry): entry is Extract<ImportEntry, { kind: "folder" }> =>
        entry.kind === "folder" && entry.name === folderName
    );
    if (!folder) {
      folder = { kind: "folder", name: folderName, children: [] };
      children.push(folder);
    }
    children = folder.children;
  }

  children.push({
    kind: "file",
    name: parts.at(-1) ?? file.name,
    file,
  });
}

function fileListToImportDirectory(files: FileList): ImportDirectory | null {
  const root: ImportDirectory = { name: "", children: [] };

  for (const file of Array.from(files) as WebkitDirectoryFile[]) {
    addFileToTree(root, file);
  }

  if (root.children.length === 0) {
    return null;
  }
  function sortTree(entries: ImportEntry[]) {
    sortEntries(entries);
    for (const entry of entries) {
      if (entry.kind === "folder") {
        sortTree(entry.children);
      }
    }
  }
  sortTree(root.children);
  return {
    name: root.name || "Imported Workspace",
    children: root.children,
    skippedPaths: root.skippedPaths,
  };
}

function pickWithFileInput(input: HTMLInputElement) {
  return new Promise<ImportDirectory | null>((resolve) => {
    input.value = "";
    const finish = (directory: ImportDirectory | null) => {
      input.onchange = null;
      input.oncancel = null;
      resolve(directory);
    };
    input.onchange = () =>
      finish(input.files ? fileListToImportDirectory(input.files) : null);
    input.oncancel = () => finish(null);
    input.click();
  });
}

export async function pickObsidianImportDirectory(
  fallbackInput: HTMLInputElement
): Promise<ImportDirectory | null> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;

  if (picker) {
    try {
      return directoryHandleToImportDirectory(await picker());
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }
      throw error;
    }
  }

  return pickWithFileInput(fallbackInput);
}
