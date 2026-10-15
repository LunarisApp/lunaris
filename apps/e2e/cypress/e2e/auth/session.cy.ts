/// <reference path="../../support/index.d.ts" />

describe("auth/session", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("redirects unauthenticated visits from protected routes to /auth", () => {
    cy.visit("/");
    cy.location("pathname", { timeout: 15_000 }).should(
      "match",
      /^\/auth(\/|$)/
    );
  });

  it("redirects authenticated visits from /auth to the app", () => {
    cy.uniqueEmail().then((email) => {
      cy.register({ name: "E2E User", email, password: "password123" });
      cy.verifyEmailViaLog(email);
      cy.get('[data-testid="auth-onboarding-writing"]').click();
      cy.get('[data-testid="auth-onboarding-continue"]').click();

      cy.visit("/auth");
      cy.location("pathname", { timeout: 15_000 }).should(
        "not.match",
        /^\/auth(\/|$)/
      );
    });
  });
});
