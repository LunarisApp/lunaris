/// <reference path="../../support/index.d.ts" />

describe("workspaces/workspaces-list", () => {
  beforeEach(() => {
    cy.bootstrapWorkspacesPage();
  });

  it("shows the seeded welcome workspace on a fresh session", () => {
    cy.get('[data-testid="workspaces-list-item-welcome"]').within(() => {
      cy.get('[data-testid="workspaces-list-item-name"]').should(
        "contain",
        "Welcome to Lunaris"
      );
      cy.get('[data-testid="workspaces-list-item-slug"]').should(
        "contain",
        "welcome"
      );
      cy.contains("Updated").should("be.visible");
    });
  });

  it("renders multiple workspace cards with names, slugs, and updated text", () => {
    cy.createWorkspace({ name: "Atlas" });
    cy.createWorkspace({ name: "Borealis" });
    cy.createWorkspace({ name: "Comet" });

    cy.get('[data-testid="workspaces-list"]').should("be.visible");
    cy.get('[data-testid="workspaces-list"]')
      .children()
      .should("have.length", 4);

    [
      { name: "Welcome to Lunaris", slug: "welcome" },
      { name: "Atlas", slug: "atlas" },
      { name: "Borealis", slug: "borealis" },
      { name: "Comet", slug: "comet" },
    ].forEach(({ name, slug }) => {
      cy.get(`[data-testid="workspaces-list-item-${slug}"]`).within(() => {
        cy.get('[data-testid="workspaces-list-item-name"]').should(
          "contain",
          name
        );
        cy.get('[data-testid="workspaces-list-item-slug"]').should(
          "contain",
          slug
        );
        cy.contains("Updated").should("be.visible");
      });
    });
  });

  it("searches, sorts, and switches views from one controls row", () => {
    cy.createWorkspace({ name: "Beacon" });
    cy.createWorkspace({ name: "Atlas" });

    cy.get(
      [
        '[data-testid="workspaces-search"]',
        '[data-testid="workspaces-sort"]',
        '[data-testid="workspaces-view-grid"]',
        '[data-testid="workspaces-create-launcher-header"]',
      ].join(",")
    ).then(($controls) => {
      const verticalCenters = [...$controls].map((control) => {
        const bounds = control.getBoundingClientRect();
        return bounds.top + bounds.height / 2;
      });
      expect(
        Math.max(...verticalCenters) - Math.min(...verticalCenters)
      ).to.be.lessThan(2);
    });

    cy.get('[data-testid="workspaces-search"]').click();
    cy.get('[data-testid="search-dialog-input"]').type("beac");
    cy.contains('[role="option"]', "Beacon").should("be.visible");
    cy.get('[role="option"]').filter(':contains("Atlas")').should("not.exist");
    cy.get('[data-testid="search-dialog-input"]').type("{esc}");

    cy.get('[data-testid="workspaces-sort"]').click();
    cy.get('[data-testid="workspaces-sort-name"]').click();
    cy.get('[data-testid="workspaces-list"]')
      .children()
      .first()
      .should("contain", "Atlas");

    cy.get('[data-testid="workspaces-view-list"]').click();
    cy.get('[data-testid="workspaces-list"]').should(
      "have.attr",
      "data-view",
      "list"
    );
  });

  it("navigates to a workspace when its card is clicked", () => {
    cy.createWorkspace({ name: "Pico Doc", slug: "pico" });

    cy.get('[data-testid="workspaces-list-item-pico"]').click();
    // Organization slug is auto-generated (ws-<hex>); just assert we're on
    // `/<organizationSlug>/pico`, i.e. two path segments ending in `/pico`.
    cy.location("pathname").should("match", /^\/[^/]+\/pico(\/|$)/);
    cy.go("back");
    cy.get('[data-testid="workspaces-list-item-pico"]').should("be.visible");
  });

  it("shows enabled creation options and disabled templates", () => {
    cy.get('[data-testid="workspaces-create-launcher-header"]').click();

    cy.get('[data-testid="workspaces-create-option-empty"]')
      .should("be.visible")
      .and("not.have.attr", "aria-disabled", "true")
      .and("not.have.attr", "data-disabled");
    cy.contains(
      '[data-slot="dropdown-menu-item"]',
      "Import from Obsidian"
    ).should(($item) => {
      expect(
        $item.attr("aria-disabled") === "true" || $item.is("[data-disabled]")
      ).to.eq(false);
    });
    cy.contains('[data-slot="dropdown-menu-item"]', "Browse templates").should(
      ($item) => {
        expect(
          $item.attr("aria-disabled") === "true" || $item.is("[data-disabled]")
        ).to.eq(true);
      }
    );
  });
});
