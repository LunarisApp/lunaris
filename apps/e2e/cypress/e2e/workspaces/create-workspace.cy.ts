/// <reference path="../../support/index.d.ts" />

const openCreateDialog = () => {
  cy.get('[data-testid="workspaces-create-launcher-header"]').click();
  cy.get('[data-testid="workspaces-create-option-empty"]').click();
  cy.get('[data-testid="workspaces-create-dialog"]').should("be.visible");
};

describe("workspaces/create-workspace", () => {
  beforeEach(() => {
    cy.bootstrapWorkspacesPage();
  });

  it("creates the first custom workspace beside the seeded welcome workspace", () => {
    openCreateDialog();
    cy.get('[data-testid="workspaces-create-name"]').type("My First Workspace");
    cy.get('[data-testid="workspaces-create-slug"]').should(
      "have.value",
      "my-first-workspace"
    );
    cy.get('[data-testid="workspaces-create-submit"]').click();

    cy.get('[data-testid="workspaces-create-dialog"]').should("not.exist");
    // Organization home is `/<organizationSlug>` (auto-generated `ws-<hex>`).
    cy.location("pathname").should("match", /^\/[^/]+\/?$/);
    cy.get('[data-testid="workspaces-list-item-welcome"]').should("be.visible");
    cy.get('[data-testid="workspaces-list-item-my-first-workspace"]').should(
      "be.visible"
    );
  });

  it("creates a workspace from the header launcher on a populated list", () => {
    cy.createWorkspace({ name: "Existing Workspace" });

    openCreateDialog();
    cy.get('[data-testid="workspaces-create-name"]').type("Second Workspace");
    cy.get('[data-testid="workspaces-create-slug"]').should(
      "have.value",
      "second-workspace"
    );
    cy.get('[data-testid="workspaces-create-submit"]').click();

    cy.location("pathname").should("match", /^\/[^/]+\/?$/);
    cy.get('[data-testid="workspaces-list-item-existing-workspace"]').should(
      "be.visible"
    );
    cy.get('[data-testid="workspaces-list-item-second-workspace"]').should(
      "be.visible"
    );
  });

  it("blocks submit until the name is valid", () => {
    openCreateDialog();

    cy.get('[data-testid="workspaces-create-submit"]').should("be.disabled");
    cy.get('[data-testid="workspaces-create-name"]').type("ab");
    cy.get('[data-testid="workspaces-create-submit"]').should("be.disabled");
    cy.get('[data-testid="workspaces-create-name"]').type("c");
    cy.get('[data-testid="workspaces-create-submit"]').should("not.be.disabled");
  });

  it("blocks slug collisions and recovers after a unique slug", () => {
    cy.createWorkspace({ name: "Notes" });

    openCreateDialog();
    cy.get('[data-testid="workspaces-create-name"]').type("Notes");
    cy.get('[data-testid="workspaces-create-slug"]').should("have.value", "notes");
    cy.get('[data-testid="workspaces-create-slug-error"]').should(
      "contain",
      "Slug already exists"
    );
    cy.get('[data-testid="workspaces-create-submit"]').should("be.disabled");

    cy.get('[data-testid="workspaces-create-slug"]').clear().type("notes-2");
    cy.get('[data-testid="workspaces-create-slug-error"]').should("not.exist");
    cy.get('[data-testid="workspaces-create-submit"]').should("not.be.disabled");
  });

  it("resets the dialog form after closing", () => {
    openCreateDialog();
    cy.get('[data-testid="workspaces-create-name"]').type("Half Done");
    cy.get("body").type("{esc}");
    cy.get('[data-testid="workspaces-create-dialog"]').should("not.exist");

    openCreateDialog();
    cy.get('[data-testid="workspaces-create-name"]').should("have.value", "");
    cy.get('[data-testid="workspaces-create-slug"]').should("have.value", "");
  });
});
