/// <reference path="../../support/index.d.ts" />

describe("organization/routing", () => {
  beforeEach(() => {
    cy.resetE2eState();
    cy.signInAnonymous();
  });

  it("redirects root `/` to /:organizationSlug (workspaces list)", () => {
    cy.visit("/");
    cy.location("pathname", { timeout: 15_000 }).should(
      "match",
      /^\/[^/]+\/?$/
    );
    cy.get('[data-testid="workspaces-page"]').should("be.visible");
  });

  it("renders workspace URLs as /:organizationSlug/:workspaceSlug", () => {
    cy.visit("/");
    cy.get('[data-testid="workspaces-page"]').should("be.visible");
    cy.createWorkspace({ name: "Atlas", slug: "atlas" });
    cy.get('[data-testid="workspaces-list-item-atlas"]').click();
    cy.location("pathname", { timeout: 15_000 }).should(
      "match",
      /^\/[^/]+\/atlas(\/|$)/
    );
  });

  it("shows OrganizationNotFound when the URL slug doesn't belong to the user", () => {
    cy.visit("/");
    cy.get('[data-testid="workspaces-list-item-welcome"]', {
      timeout: 30_000,
    }).should("be.visible");
    cy.visit("/does-not-exist");
    cy.contains("Organization not found", { timeout: 15_000 }).should(
      "be.visible"
    );
  });

  it("routes to organization settings at /:organizationSlug/settings", () => {
    cy.visit("/");
    // Wait for the IndexRedirect to land on `/:organizationSlug` before reading
    // the slug; otherwise pathname is still `/` and the next visit resolves
    // to the user-settings route.
    cy.location("pathname", { timeout: 15_000 })
      .should("match", /^\/[^/]+\/?$/)
      .then((root) => {
        const slug = root.replace(/^\//, "").replace(/\/$/, "");
        cy.visit(`/${slug}/settings`);
        cy.contains("Organization Settings", { timeout: 15_000 }).should(
          "be.visible"
        );
      });
  });
});
