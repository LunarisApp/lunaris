/// <reference path="../../support/index.d.ts" />

import { typeYjsText } from "../../support/yjs";

const documentBodySelector =
  '[data-yjs-persistence-state] .bn-block-content[data-content-type="paragraph"] .bn-inline-content';
const renameInputSelector = 'input[aria-label="Rename resource"]';

function renameNewItem(name: string) {
  cy.get(documentBodySelector, { timeout: 15_000 }).should("be.visible");
  cy.get("body").then(($body) => {
    const input = $body.find(renameInputSelector);
    if (input.length > 0) {
      cy.wrap(input).type("{esc}");
    }
  });
  cy.contains('[data-testid="workspace-tree-item"]', "Untitled").dblclick();
  cy.get(renameInputSelector).clear().type(`${name}{enter}`);
}

describe("editor/core workflow", () => {
  beforeEach(() => {
    cy.bootstrapWorkspacesPage();
    cy.createWorkspace({ name: "Writing Flow" });
    cy.get('[data-testid="workspaces-list-item-writing-flow"]').click();
  });

  it("creates, renames, searches, deep-links, persists, and deletes content", () => {
    cy.get('[data-testid="workspace-add-folder"]').click();
    cy.get('input[aria-label="Rename resource"]').clear().type("Drafts{enter}");
    cy.contains('[data-testid="workspace-tree-item"]', "Drafts").should(
      "be.visible"
    );

    cy.get('button[aria-label="Add file"]').click();
    cy.contains('[role="menuitem"]', "Rich Text").click();
    renameNewItem("Opening Scene");
    const body = "The observatory lights flickered twice.";
    typeYjsText(documentBodySelector, body);

    cy.get('button[aria-label="Search"]').click();
    cy.get('[data-testid="search-dialog-input"]').type("observatory lights");
    cy.contains("Content Matches").should("be.visible");
    cy.contains('[role="option"]', "Opening Scene").click();

    cy.contains('[data-testid="workspace-tree-item"]', "Opening Scene").click();
    cy.location("pathname").then((documentPath) => {
      cy.reload();
      cy.location("pathname").should("eq", documentPath);
      cy.contains(documentBodySelector, body, { timeout: 15_000 }).should(
        "be.visible"
      );
    });

    cy.get('input[aria-label="Search resources..."]').type("Opening Scene");
    cy.get('[role="listbox"]')
      .contains('[role="option"]', "Opening Scene")
      .should("be.visible")
      .click();
    cy.get('input[aria-label="Search resources..."]').clear();

    cy.contains("button", "Open options").click();
    cy.contains('[role="menuitem"]', "Version history").click();
    cy.get('[data-testid="rich-text-version-history"]', {
      timeout: 15_000,
    }).should("be.visible");

    cy.contains('[data-testid="workspace-tree-item"]', "Drafts").rightclick();
    cy.contains('[role="menuitem"]', "Delete").click();
    cy.get('[role="alertdialog"]').contains("button", "Continue").click();
    cy.contains('[data-testid="workspace-tree-item"]', "Drafts").should(
      "not.exist"
    );
  });
});
