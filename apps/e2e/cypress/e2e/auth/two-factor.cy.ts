/// <reference path="../../support/index.d.ts" />

export {};

describe("auth/two-factor", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("enables 2FA, signs in with a recovery code, then disables it", () => {
    cy.registerVerifiedUser({ prefix: "two-factor" }).then(
      ({ email, password }) => {
        cy.visit("/");
        cy.openSettings();
        cy.openSettingsTab("account");
        cy.get('[data-testid="settings-security-two-factor-enable"]').click();
        cy.get('[data-testid="two-factor-enable-password"]').type(password, {
          log: false,
        });
        cy.get('[data-testid="two-factor-setup-dialog"]')
          .contains("button", "Continue")
          .click();

        cy.get('[data-testid="two-factor-secret"]')
          .invoke("text")
          .then((secret) => {
            cy.task<string>("generateTotp", { secret: secret.trim() }).then(
              (code) => {
                cy.get('[data-testid="two-factor-setup-code"]').type(code);
                cy.get('[data-testid="two-factor-setup-dialog"]')
                  .contains("button", "Verify and enable")
                  .click();
              }
            );
          });

        cy.get('[data-testid="two-factor-backup-codes"] li')
          .first()
          .invoke("text")
          .then((backupCode) => {
            cy.get('[data-testid="two-factor-backup-codes-saved"]').click();
            cy.get('[data-testid="two-factor-setup-dialog"]')
              .contains("button", "Done")
              .click();

            cy.signOut();
            cy.visit("/auth/email");
            cy.get('[data-testid="auth-signin-email"]').type(email);
            cy.get('[data-testid="auth-signin-password"]').type(password, {
              log: false,
            });
            cy.get('[data-testid="auth-signin-submit"]').click();
            cy.location("pathname", { timeout: 15_000 }).should(
              "eq",
              "/auth/two-factor"
            );
            cy.get('[data-testid="auth-two-factor-switch-method"]').click();
            cy.get('[data-testid="auth-two-factor-code"]').type("invalid-code");
            cy.get('[data-testid="auth-two-factor-submit"]').click();
            cy.get('[role="alert"]').should("be.visible");
            cy.get('[data-testid="auth-two-factor-code"]').type(
              `{selectall}${backupCode.trim()}`,
              { log: false }
            );
            cy.get('[data-testid="auth-two-factor-submit"]').click();
            cy.location("pathname", { timeout: 15_000 }).should(
              "not.match",
              /^\/auth(\/|$)/
            );

            cy.visit("/");
            cy.openSettings();
            cy.openSettingsTab("account");
            cy.get('[data-testid="settings-security-two-factor"]')
              .contains("button", "Manage")
              .click();
            cy.get(
              '[data-testid="settings-security-two-factor-disable"]'
            ).click();
            cy.get('[data-testid="two-factor-disable-password"]').type(
              password,
              { log: false }
            );
            cy.get('[data-testid="two-factor-disable-dialog"]')
              .contains("button", "Disable")
              .click();
            cy.get('[data-testid="two-factor-disable-dialog"]').should(
              "not.exist"
            );
          });
      }
    );
  });
});
