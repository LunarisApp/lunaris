/// <reference path="../../support/index.d.ts" />

describe("auth/sign-in", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("signs in a verified user and lands on a non-auth route", () => {
    cy.uniqueEmail().then((email) => {
      const password = "password123";
      cy.register({ name: "E2E User", email, password });
      cy.verifyEmailViaLog(email);
      cy.signOut();

      cy.signIn({ email, password });
      cy.location("pathname").should("not.match", /^\/auth(\/|$)/);
    });
  });

  it("remembers Email as the last used sign-in method", () => {
    cy.uniqueEmail().then((email) => {
      const password = "password123";
      cy.register({ name: "E2E User", email, password });
      cy.verifyEmailViaLog(email);
      cy.signOut();

      cy.signIn({ email, password });
      // Unload active session requests before signing out, retaining the
      // last-login cookie so the next page can display the real server value.
      cy.signOut({ clearCookies: false });
      cy.visit("/auth");

      cy.get('[data-testid="auth-last-used-email"]')
        .should("be.visible")
        .and("have.text", "Last used");
      cy.get('[data-testid="auth-last-used-google"]').should("not.exist");
    });
  });

  it("rejects invalid credentials and stays on /auth/email", () => {
    cy.visit("/auth/email");
    cy.get('[data-testid="auth-signin-email"]').type("nobody@e2e.lunaris.app");
    cy.get('[data-testid="auth-signin-password"]').type("wrong-password");
    cy.get('[data-testid="auth-signin-submit"]').click();
    cy.url().should("include", "/auth/email");
  });

  it("blocks unverified users on /auth/verify-email", () => {
    // Load-bearing assumption: backend runs with EMAIL_VERIFICATION_DISABLED=false.
    // Without that, the register hook in internal/auth/src/server.ts auto-verifies
    // the user and VerifyEmailPage redirects to the organization home, making this a no-op.
    cy.uniqueEmail().then((email) => {
      cy.register({ name: "E2E User", email, password: "password123" });
      cy.location("pathname").should("eq", "/auth/verify-email");
      cy.reload();
      cy.location("pathname").should("eq", "/auth/verify-email");
      cy.visit("/");
      cy.location("pathname").should("eq", "/auth/verify-email");
    });
  });

  it("signs out and redirects protected pages back to /auth", () => {
    cy.uniqueEmail().then((email) => {
      const password = "password123";
      cy.register({ name: "E2E User", email, password });
      cy.verifyEmailViaLog(email);
      cy.get('[data-testid="auth-onboarding"]', { timeout: 15_000 }).should(
        "be.visible"
      );
      cy.get('[data-testid="auth-onboarding-writing"]').click();
      cy.get('[data-testid="auth-onboarding-continue"]').click();
      cy.location("pathname").should("not.match", /^\/auth(\/|$)/);

      cy.signOut();
      cy.visit("/");
      cy.location("pathname").should("match", /^\/auth(\/|$)/);
    });
  });

  it("returns verified users to requested protected url after sign-in", () => {
    cy.uniqueEmail().then((email) => {
      const password = "password123";
      cy.register({ name: "E2E User", email, password });
      cy.verifyEmailViaLog(email);
      cy.signOut();

      cy.visit("/workspaces?tab=shared#team");
      cy.location("pathname").should("eq", "/auth");
      cy.location("search").should("include", "redirectTo=");

      cy.get('[data-testid="auth-entry-email"]').type(email);
      cy.get('[data-testid="auth-entry-email-submit"]').click();
      cy.get('[data-testid="auth-signin-password"]').type(password, {
        log: false,
      });
      cy.get('[data-testid="auth-signin-submit"]').click();

      cy.location("pathname", { timeout: 15_000 }).should("eq", "/workspaces");
      cy.location("search").should("include", "tab=shared");
      cy.location("search").should("include", "region=");
      cy.location("hash").should("eq", "#team");
    });
  });
});
