import type { ImportDirectory, ImportEntry } from "./obsidian-import-service";

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
  return {
    name: handle.name,
    children: sortEntries(await readDirectoryEntries(handle)),
  };
}

async function readDirectoryEntries(
  handle: NativeDirectoryHandle
): Promise<ImportEntry[]> {
  const entries: ImportEntry[] = [];

  for await (const [, child] of handle.entries()) {
    if (child.kind === "directory") {
      entries.push({
        kind: "folder",
        name: child.name,
        children: sortEntries(await readDirectoryEntries(child)),
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
  root.children = sortEntries(root.children);
  return {
    name: root.name || "Imported Workspace",
    children: root.children,
  };
}

function pickWithFileInput(input: HTMLInputElement) {
  return new Promise<ImportDirectory | null>((resolve) => {
    input.value = "";
    input.onchange = () => {
      resolve(input.files ? fileListToImportDirectory(input.files) : null);
      input.onchange = null;
    };
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
