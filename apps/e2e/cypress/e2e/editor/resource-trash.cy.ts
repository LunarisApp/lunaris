/// <reference path="../../support/index.d.ts" />

function createFolder(name: string) {
  cy.get('[data-testid="workspace-add-folder"]').click();
  cy.get('input[aria-label="Rename resource"]').clear().type(`${name}{enter}`);
  cy.contains('[data-testid="workspace-tree-item"]', name).should("be.visible");
}

function trashFolder(name: string) {
  cy.contains('[data-testid="workspace-tree-item"]', name).rightclick();
  cy.contains('[role="menuitem"]', "Delete").click();
  cy.get('[role="alertdialog"]').contains("button", "Continue").click();
  cy.contains('[data-testid="workspace-tree-item"]', name).should("not.exist");
}

function openTrash() {
  cy.get('[data-testid="workspace-trash-trigger"]').click();
  cy.get('[data-testid="workspace-trash-panel"]').should("be.visible");
}

describe("editor/resource trash", () => {
  beforeEach(() => {
    cy.bootstrapWorkspacesPage();
    cy.createWorkspace({ name: "Trash Flow" });
    cy.get('[data-testid="workspaces-list-item-trash-flow"]').click();
  });

  it("restores and permanently deletes selected trash roots", () => {
    createFolder("Recover me");
    trashFolder("Recover me");
    openTrash();

    cy.get('[data-testid="workspace-trash-item"]')
      .contains("Recover me")
      .should("be.visible");
    cy.get('[aria-label="Select Recover me"]').click();
    cy.contains("button", "Restore").click();
    cy.contains('[data-testid="workspace-tree-item"]', "Recover me").should(
      "be.visible",
    );

    trashFolder("Recover me");
    cy.get('[data-testid="workspace-trash-item"]')
      .contains("Recover me")
      .should("be.visible");
    cy.get('[aria-label="Select Recover me"]').click();
    cy.contains("button", "Delete now").click();
    cy.get('[role="alertdialog"]').contains("button", "Delete now").click();
    cy.get('[data-testid="workspace-trash-item"]').should("not.exist");
    cy.contains("Trash is empty").should("be.visible");
  });

  it("opens the Trash panel on mobile", () => {
    createFolder("Mobile draft");
    trashFolder("Mobile draft");

    cy.viewport(390, 844);
    cy.reload();
    openTrash();

    cy.get('[data-testid="workspace-trash-item"]')
      .contains("Mobile draft")
      .should("be.visible");
    cy.contains("Deleted resources are kept for 30 days").should("be.visible");
  });
});
