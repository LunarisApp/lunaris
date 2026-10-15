/// <reference path="../../support/index.d.ts" />

describe("auth/password-reset", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("resets password via log-delivered URL and signs in with new password", () => {
    cy.uniqueEmail().then((email) => {
      const originalPassword = "password123";
      const newPassword = "newpassword456";

      cy.register({ name: "E2E User", email, password: originalPassword });
      cy.verifyEmailViaLog(email);
      cy.signOut();

      cy.requestPasswordReset(email);
      cy.resetPasswordViaLog({ email, newPassword });

      // New password should work.
      cy.signIn({ email, password: newPassword });
      cy.location("pathname").should("not.match", /^\/auth(\/|$)/);
    });
  });

  it("shows the invalid-token fallback when /auth/reset-password has no token", () => {
    cy.visit("/auth/reset-password");
    cy.get('[data-testid="auth-reset-invalid"]').should("be.visible");
    cy.get('[data-testid="auth-reset-forgot-link"]').click();
    cy.url().should("include", "/auth/forgot-password");
  });
});
