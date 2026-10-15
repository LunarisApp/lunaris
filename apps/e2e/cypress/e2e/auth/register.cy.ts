/// <reference path="../../support/index.d.ts" />

describe("auth/register", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("signs up, verifies email via log, lands on a non-auth route", () => {
    cy.uniqueEmail().then((email) => {
      cy.register({
        name: "E2E User",
        email,
        password: "password123",
      });
      cy.verifyEmailViaLog(email);
      cy.location("pathname").should("not.match", /^\/auth(\/|$)/);
    });
  });

  it("shows validation errors for empty and invalid fields", () => {
    cy.visit("/auth/register");
    cy.get('[data-testid="auth-register-submit"]').click();
    // Zod error for required name fires first; form stays on /auth/register.
    cy.url().should("include", "/auth/register");

    cy.get('[data-testid="auth-register-name"]').type("E2E User");
    cy.get('[data-testid="auth-register-email"]').type("not-an-email");
    cy.get('[data-testid="auth-register-password"]').type("short");
    cy.get('[data-testid="auth-register-submit"]').click();
    cy.url().should("include", "/auth/register");
  });

  it("shows an error when signing up with an email that already exists", () => {
    cy.uniqueEmail().then((email) => {
      cy.register({ name: "First", email, password: "password123" });
      cy.verifyEmailViaLog(email);
      cy.signOut();

      // Second attempt with the same email should fail at the API level.
      // The form stays on /auth/register (no navigation away).
      cy.visit("/auth/register");
      cy.get('[data-testid="auth-register-name"]').type("Second");
      cy.get('[data-testid="auth-register-email"]').type(email);
      cy.get('[data-testid="auth-register-password"]').type("password123");
      cy.get('[data-testid="auth-register-submit"]').click();
      cy.url().should("include", "/auth/register");
    });
  });

  it("returns newly verified users to requested protected url after sign-up", () => {
    cy.uniqueEmail().then((email) => {
      cy.visit("/workspaces?tab=recent#verify");
      cy.location("pathname").should("eq", "/auth");
      cy.location("search").should("include", "redirectTo=");

      // Skip the onboarding purpose prompt so the verify-email redirect lands
      // directly on `resolvedRedirectTo` (auth-guard treats the completed flag
      // as terminal — see auth-guard.tsx `needsOnboarding`).
      cy.window({ log: false }).then((win) => {
        win.localStorage.setItem("lunaris_onboarding_completed", "true");
      });

      cy.get('[data-testid="auth-entry-email"]').type(email);
      cy.get('[data-testid="auth-entry-email-submit"]').click();
      cy.location("pathname").should("eq", "/auth/continue");
      cy.location("search").should("include", "redirectTo=");

      cy.get('[data-testid="auth-register-name"]').type("E2E User");
      cy.get('[data-testid="auth-register-password"]').type("password123", {
        log: false,
      });
      cy.get('[data-testid="auth-register-submit"]').click();

      cy.location("pathname", { timeout: 15_000 }).should(
        "eq",
        "/auth/verify-email",
      );
      cy.location("search").should("include", "redirectTo=");

      cy.verifyEmailViaLog(email);

      cy.location("pathname", { timeout: 15_000 }).should("eq", "/workspaces");
      cy.location("search").should("include", "tab=recent");
      cy.location("search").should("include", "region=");
      cy.location("hash").should("eq", "#verify");
    });
  });
});
