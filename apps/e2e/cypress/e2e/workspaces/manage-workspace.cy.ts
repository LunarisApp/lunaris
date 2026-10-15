/// <reference path="../../support/index.d.ts" />

describe("workspaces/manage-workspace", () => {
  beforeEach(() => {
    cy.bootstrapWorkspacesPage();
  });

  function openWorkspaceSettings(slug: string) {
    cy.openWorkspaceOptions(slug);
    cy.get('[data-testid="workspaces-options-settings"]').click();
    cy.get('[data-testid="workspace-settings-panel"]', {
      timeout: 15_000,
    }).should("be.visible");
  }

  function returnToWorkspaces() {
    cy.go("back");
    cy.get('[data-testid="workspaces-page"]').should("be.visible");
  }

  it("renames from workspace settings without changing the slug", () => {
    cy.createWorkspace({ name: "Alpha" });

    openWorkspaceSettings("alpha");
    cy.get('[data-testid="workspace-settings-name"]').clear().type("Beta");
    cy.get('[data-testid="workspace-settings-save-name"]').click();
    cy.get('[data-testid="workspace-settings-name"]').should(
      "have.value",
      "Beta",
    );
    returnToWorkspaces();

    cy.get('[data-testid="workspaces-list-item-alpha"]').should("be.visible");
    cy.get('[data-testid="workspaces-list-item-alpha"]').within(() => {
      cy.get('[data-testid="workspaces-list-item-name"]').should("contain", "Beta");
      cy.get('[data-testid="workspaces-list-item-slug"]').should("contain", "alpha");
    });
  });

  it("trims workspace names before saving", () => {
    cy.createWorkspace({ name: "Gamma" });

    openWorkspaceSettings("gamma");
    cy.get('[data-testid="workspace-settings-name"]')
      .clear()
      .type("  Gamma 2  ");
    cy.get('[data-testid="workspace-settings-save-name"]').click();
    returnToWorkspaces();

    cy.get('[data-testid="workspaces-list-item-gamma"]').within(() => {
      cy.get('[data-testid="workspaces-list-item-name"]').should(
        "contain",
        "Gamma 2",
      );
      cy.get('[data-testid="workspaces-list-item-slug"]').should(
        "contain",
        "gamma",
      );
    });
  });

  it("requires a changed, non-empty workspace name", () => {
    cy.createWorkspace({ name: "Delta" });

    openWorkspaceSettings("delta");
    cy.get('[data-testid="workspace-settings-save-name"]').should("be.disabled");
    cy.get('[data-testid="workspace-settings-name"]').clear();
    cy.get('[data-testid="workspace-settings-save-name"]').should("be.disabled");
    cy.get('[data-testid="workspace-settings-name"]').type("Delta Prime");
    cy.get('[data-testid="workspace-settings-save-name"]').should(
      "not.be.disabled",
    );
  });

  it("opens settings for the selected workspace", () => {
    cy.createWorkspace({ name: "Epsilon" });
    cy.createWorkspace({ name: "Zeta" });

    openWorkspaceSettings("zeta");
    cy.location("pathname").should("match", /\/zeta\/settings$/);
    cy.get('[data-testid="workspace-settings-name"]').should(
      "have.value",
      "Zeta",
    );
  });

  it("enforces delete confirmation text and preserves the workspace on cancel", () => {
    cy.createWorkspace({ name: "Omega" });

    cy.openWorkspaceOptions("omega");
    cy.get('[data-testid="workspaces-options-delete"]').click();
    cy.get('[data-testid="input-confirm-dialog"]').should("be.visible");
    cy.get('[data-testid="input-confirm-submit"]').should("be.disabled");
    cy.get('[data-testid="input-confirm-input"]').type("wrong");
    cy.get('[data-testid="input-confirm-submit"]').should("be.disabled");
    cy.get('[data-testid="input-confirm-input"]').clear().type("omega");
    cy.get('[data-testid="input-confirm-submit"]').should("not.be.disabled");
    cy.get('[data-testid="input-confirm-submit"]').click();

    cy.get('[data-testid="workspaces-list-item-omega"]').should("not.exist");
    // Note: the list does not regress to `workspaces-list-empty` after a delete —
    // `useStableInitialLoading` latches into "ready" once data has been seen.

    cy.createWorkspace({ name: "Omega" });
    cy.openWorkspaceOptions("omega");
    cy.get('[data-testid="workspaces-options-delete"]').click();
    cy.get('[data-testid="input-confirm-cancel"]').click();

    cy.get('[data-testid="input-confirm-dialog"]').should("not.exist");
    cy.get('[data-testid="workspaces-list-item-omega"]').should("be.visible");
  });
});
