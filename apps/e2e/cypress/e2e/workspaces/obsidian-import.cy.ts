/// <reference path="../../support/index.d.ts" />

export {};

interface PickerFileHandle {
  getFile: () => Promise<File>;
  kind: "file";
  name: string;
}

interface PickerDirectoryHandle {
  entries: () => AsyncIterableIterator<
    [string, PickerDirectoryHandle | PickerFileHandle]
  >;
  kind: "directory";
  name: string;
}

function directoryHandle(
  name: string,
  entries: [string, PickerDirectoryHandle | PickerFileHandle][]
): PickerDirectoryHandle {
  return {
    kind: "directory",
    name,
    async *entries() {
      for (const entry of entries) {
        yield entry;
      }
    },
  };
}

function fileHandle(
  name: string,
  contents: string,
  type: string
): PickerFileHandle {
  return {
    kind: "file",
    name,
    getFile: async () => new File([contents], name, { type }),
  };
}

describe("workspaces/obsidian import", () => {
  beforeEach(() => {
    cy.bootstrapWorkspacesPage();
  });

  it("imports nested markdown and preserves converted content after reload", () => {
    cy.window().then((win) => {
      const chapters = directoryHandle("Chapters", [
        [
          "Opening.md",
          fileHandle(
            "Opening.md",
            "# Opening\n\nImported constellation notes.",
            "text/markdown"
          ),
        ],
      ]);
      const vault = directoryHandle("Novel Vault", [
        ["Chapters", chapters],
        [
          "README.md",
          fileHandle(
            "README.md",
            "# Novel Vault\n\nWorkspace overview.",
            "text/markdown"
          ),
        ],
      ]);
      Object.defineProperty(win, "showDirectoryPicker", {
        configurable: true,
        value: async () => vault,
      });
    });

    cy.get('[data-testid="workspaces-create-launcher-header"]').click();
    cy.contains('[role="menuitem"]', "Import from Obsidian").click();
    cy.get('[data-testid="workspaces-import-folder-picker"]').click();
    cy.get('[data-testid="workspaces-import-name"]').should(
      "have.value",
      "Novel Vault"
    );
    cy.get('[data-testid="workspaces-import-submit"]').click();
    cy.get('[data-testid="workspaces-list-item-novel-vault"]', {
      timeout: 30_000,
    }).click();

    cy.contains('[data-testid="workspace-tree-item"]', "Chapters")
      .should("be.visible")
      .click();
    cy.contains('[data-testid="workspace-tree-item"]', "Opening").click();
    cy.contains("Imported constellation notes.", { timeout: 15_000 }).should(
      "be.visible"
    );
    cy.reload();
    cy.contains("Imported constellation notes.", { timeout: 15_000 }).should(
      "be.visible"
    );
  });
});
