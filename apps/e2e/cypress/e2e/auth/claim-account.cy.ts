/// <reference path="../../support/index.d.ts" />

export {};

describe("auth/claim-account", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("adopts the guest organization after account claim", () => {
    cy.signInAnonymous();
    cy.visit("/");
    cy.location("pathname").then((guestOrganizationPath) => {
      cy.uniqueEmail("claim").then((email) => {
        cy.openSettings();
        cy.openSettingsTab("account");
        cy.get('[data-testid="settings-account-claim-email"]').click();
        cy.get('[data-testid="auth-register-email"]').type(email);
        cy.get('[data-testid="auth-register-name"]').type("Claimed User");
        cy.get('[data-testid="auth-register-password"]').type("password123", {
          log: false,
        });
        cy.get('[data-testid="auth-register-submit"]').click();
        cy.verifyEmailViaLog(email);

        cy.get('[data-testid="auth-onboarding"]', { timeout: 15_000 }).should(
          "be.visible",
        );
        cy.get('[data-testid="auth-onboarding-writing"]').click();
        cy.get('[data-testid="auth-onboarding-continue"]').click();
        cy.location("pathname", { timeout: 15_000 }).should(
          "eq",
          guestOrganizationPath,
        );
        cy.get('[data-testid="organization-selector-trigger"]').click();
        cy.get('[role="menuitemradio"]').should("have.length", 1);
      });
    });
  });
});
