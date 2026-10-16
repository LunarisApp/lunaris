/// <reference path="../../support/index.d.ts" />

export {};

describe("organization/lifecycle", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("creates, switches, renames, and isolates organization workspaces", () => {
    const suffix = `${Date.now()}`;
    const initialSlug = `writers-${suffix}`;
    const renamedSlug = `authors-${suffix}`;

    cy.registerVerifiedUser({ prefix: "organization-lifecycle" }).then(() => {
      cy.visit("/");
      cy.get('[data-testid="workspaces-page"]').should("be.visible");
      cy.location("pathname").then((personalPath) => {
        cy.get('[data-testid="organization-selector-trigger"]').click();
        cy.get('[data-testid="organization-create-trigger"]').click();
        cy.get('[data-testid="organization-create-name"]').type("Writers Room");
        cy.get('[data-testid="organization-create-slug"]').clear().type(initialSlug);
        cy.get('[data-testid="organization-create-submit"]').click();
        cy.location("pathname", { timeout: 15_000 }).should(
          "eq",
          `/${initialSlug}`,
        );

        cy.intercept("POST", "**/v1/sync/ingest").as("teamWorkspaceSync");
        cy.createWorkspace({ name: "Team Novel" });
        cy.wait("@teamWorkspaceSync")
          .its("response.statusCode")
          .should("eq", 200);
        cy.get('[data-testid="organization-selector-trigger"]').click();
        cy.get('[role="menuitemradio"]')
          .not(':contains("Writers Room")')
          .click();
        cy.location("pathname", { timeout: 15_000 }).should("eq", personalPath);
        cy.get('[data-testid="workspaces-list-item-team-novel"]').should(
          "not.exist",
        );

        cy.get('[data-testid="organization-selector-trigger"]').click();
        cy.contains('[role="menuitemradio"]', "Writers Room").click();
        cy.location("pathname", { timeout: 15_000 }).should(
          "eq",
          `/${initialSlug}`,
        );
        cy.get('[data-testid="workspaces-list-item-team-novel"]', {
          timeout: 30_000,
        }).should("be.visible");

        cy.get('[data-testid="organization-selector-trigger"]').click();
        cy.get('[data-testid="organization-settings-trigger"]').click();
        cy.get('[data-testid="organization-name"]')
          .clear()
          .type("Authors Room")
          .blur();
        cy.get('[data-testid="organization-name"]').should(
          "have.value",
          "Authors Room",
        );
        cy.get('[data-testid="organization-slug"]')
          .clear()
          .type(renamedSlug)
          .blur();
        cy.location("pathname", { timeout: 15_000 }).should(
          "eq",
          `/${renamedSlug}/settings`,
        );
        cy.get('[data-testid="organization-slug"]').should(
          "have.value",
          renamedSlug,
        );
        cy.get('a[aria-label="Lunaris"]').click();
        cy.get('[data-testid="organization-selector-trigger"]').should(
          "contain.text",
          "Authors Room",
        );
        cy.get('[data-testid="workspaces-list-item-team-novel"]', {
          timeout: 30_000,
        }).should("be.visible");

        cy.visit(`/${renamedSlug}/settings`);
        cy.intercept("POST", "**/v1/organization/delete-request").as(
          "organizationDeleteRequest",
        );
        cy.contains("button", "Delete organization").click();
        cy.get('[data-testid="input-confirm-input"]')
          .should("not.be.disabled")
          .type(renamedSlug);
        cy.get('[data-testid="input-confirm-submit"]').click();
        cy.wait("@organizationDeleteRequest").its("response.statusCode").should(
          "be.oneOf",
          [200, 201],
        );
      });
    });
  });
});
