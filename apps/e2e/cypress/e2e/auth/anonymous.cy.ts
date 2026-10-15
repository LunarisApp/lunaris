/// <reference path="../../support/index.d.ts" />

describe("auth/anonymous", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("starts a guest session and lands on a non-auth route", () => {
    cy.signInAnonymous();
    cy.location("pathname").should("not.match", /^\/auth(\/|$)/);
  });

  it("keeps the guest session across reloads", () => {
    cy.signInAnonymous();
    cy.location("pathname").should("not.match", /^\/auth(\/|$)/);
    cy.reload();
    cy.location("pathname").should("not.match", /^\/auth(\/|$)/);
  });

  it("returns guest users to requested protected url after sign-in", () => {
    cy.visit("/workspaces?tab=offline#guest");
    cy.location("pathname").should("eq", "/auth");
    cy.location("search").should("include", "redirectTo=");

    cy.get('[data-testid="auth-entry-guest"]').click();

    cy.location("pathname", { timeout: 15_000 }).should("eq", "/workspaces");
    cy.location("search").should("include", "tab=offline");
    cy.location("search").should("include", "region=");
    cy.location("hash").should("eq", "#guest");
  });
});
