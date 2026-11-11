/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vitest";
import { pickObsidianImportDirectory } from "./obsidian-folder-picker";

afterEach(() => {
  Reflect.deleteProperty(window, "showDirectoryPicker");
});
it("excludes hidden folders before enumerating them or reading files", async () => {
  const hiddenEntries = vi.fn();
  const getFile = vi.fn();
  Object.defineProperty(window, "showDirectoryPicker", {
    configurable: true,
    value: async () => ({
      name: "Vault",
      async *entries() {
        yield [
          ".git",
          { kind: "directory", name: ".git", entries: hiddenEntries },
        ];
        yield [".secret.md", { kind: "file", name: ".secret.md", getFile }];
        yield [
          "Note.md",
          {
            kind: "file",
            name: "Note.md",
            getFile: async () => new File(["# Note"], "Note.md"),
          },
        ];
      },
    }),
  });
  const directory = await pickObsidianImportDirectory(
    document.createElement("input")
  );
  expect(hiddenEntries).not.toHaveBeenCalled();
  expect(getFile).not.toHaveBeenCalled();
  expect(directory?.children).toHaveLength(1);
  expect(directory?.skippedPaths).toEqual([".git", ".secret.md"]);
});
it("settles a cancelled fallback picker and removes handlers", async () => {
  const input = document.createElement("input");
  input.click = () => input.dispatchEvent(new Event("cancel"));
  await expect(pickObsidianImportDirectory(input)).resolves.toBeNull();
  expect(input.onchange).toBeNull();
  expect(input.oncancel).toBeNull();
});
it("sorts nested fallback folders and collapses hidden subtrees in the report", async () => {
  const input = document.createElement("input");
  const files = [
    "Vault/Folder/z.md",
    "Vault/.git/a",
    "Vault/Folder/a.md",
    "Vault/.git/b",
  ].map((path) => {
    const file = new File(["# Note"], path.split("/").at(-1)!);
    Object.defineProperty(file, "webkitRelativePath", { value: path });
    return file;
  });
  Object.defineProperty(input, "files", { value: files });
  input.click = () => input.dispatchEvent(new Event("change"));
  const directory = await pickObsidianImportDirectory(input);
  const folder = directory?.children[0];
  expect(
    folder?.kind === "folder" && folder.children.map((entry) => entry.name)
  ).toEqual(["a.md", "z.md"]);
  expect(directory?.skippedPaths).toEqual([".git"]);
});
