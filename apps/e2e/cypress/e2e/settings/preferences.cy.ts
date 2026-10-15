/// <reference path="../../support/index.d.ts" />

describe("settings/preferences", () => {
  beforeEach(() => {
    cy.bootstrapWorkspacesPage();
  });

  it("persists locale, theme, typography, and debug logging across reload", () => {
    cy.openSettings();
    cy.openSettingsTab("preferences");

    cy.get('[data-testid="settings-preferences-locale-trigger"]').click({ force: true });
    cy.get('[data-slot="select-content"]').should("be.visible");
    cy.get('[data-testid="settings-preferences-locale-es"]')
      .trigger("mousemove")
      .click();
    cy.get("html").should("have.attr", "lang", "es");
    cy.get('[data-testid="settings-panel-preferences"]').should(
      "contain",
      "Idioma"
    );

    cy.get('[data-testid="settings-preferences-theme-dark"]').click();
    cy.get("html").should("have.class", "dark");

    cy.get('[data-testid="settings-preferences-font-size-extra-large"]').click();
    cy.get("html").should("have.class", "font-size-extra-large");

    cy.get('[data-testid="settings-preferences-font-family-serif"]').click();
    cy.get("html").should("have.class", "font-family-serif");

    cy.get('[data-testid="settings-preferences-debug-logging"]').click();
    cy.window().then((win) => {
      expect(win.localStorage.getItem("lunaris.debugLogging")).to.eq("true");
      expect(win.localStorage.getItem("lunaris.locale")).to.eq("es");
      expect(win.localStorage.getItem("lunaris.fontSize")).to.eq("extra-large");
      expect(win.localStorage.getItem("lunaris.fontFamily")).to.eq("serif");
      expect(win.localStorage.getItem("theme")).to.eq("dark");
    });

    cy.reload();
    cy.get("html")
      .should("have.attr", "lang", "es")
      .and("have.class", "dark")
      .and("have.class", "font-size-extra-large")
      .and("have.class", "font-family-serif");

    // Settings is now a real route — reload keeps us on `/settings/preferences`,
    // so the preferences panel is already mounted.
    cy.get('[data-testid="settings-panel-preferences"]').should("be.visible");
    cy.get('[data-testid="settings-preferences-debug-logging"]').should(
      "have.attr",
      "data-checked"
    );
  });
});
