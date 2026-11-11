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
  contents: BlobPart,
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

  it("preserves nested notes, links, and images after reload", () => {
    cy.window().then((win) => {
      const chapters = directoryHandle("Chapters", [
        [
          "Opening.md",
          fileHandle(
            "Opening.md",
            "# Opening\n\nImported constellation notes.\n\n[[Overview|Read overview]]\n\n![[star.png|80]]",
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
            "---\naliases: [Overview]\n---\n# Novel Vault\n\nWorkspace overview.",
            "text/markdown"
          ),
        ],
        [
          "star.png",
          fileHandle(
            "star.png",
            Uint8Array.from(
              atob(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ZkAAAAASUVORK5CYII="
              ),
              (character) => character.charCodeAt(0)
            ),
            "image/png"
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
    cy.contains('[role="status"]', "Import complete", {
      timeout: 30_000,
    }).should("be.visible");
    cy.get('[data-testid="workspaces-import-obsidian-dialog"]')
      .contains("button", "Close")
      .click();
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
    cy.get('img[alt="star.png"]').should(($image) => {
      expect(($image[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
    });
    cy.reload();
    cy.contains("Imported constellation notes.", { timeout: 15_000 }).should(
      "be.visible"
    );
    cy.get('img[alt="star.png"]').should(($image) => {
      expect(($image[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
    });
    cy.contains(
      'button[data-entity-reference-kind="resource"]',
      "Read overview"
    ).click();
    cy.contains("Workspace overview.").should("be.visible");
  });
});
