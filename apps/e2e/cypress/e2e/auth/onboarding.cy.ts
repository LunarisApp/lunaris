/// <reference path="../../support/index.d.ts" />

export {};

describe("auth/onboarding", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("collects a purpose and does not show onboarding again", () => {
    cy.uniqueEmail("onboarding").then((email) => {
      cy.register({ name: "New Writer", email, password: "password123" });
      cy.verifyEmailViaLog(email);

      cy.location("pathname", { timeout: 15_000 }).should(
        "eq",
        "/auth/onboarding"
      );
      cy.get('[data-testid="auth-onboarding-continue"]').should("be.disabled");
      cy.get('[data-testid="auth-onboarding-other"]').type("Screenwriting");
      cy.get('[data-testid="auth-onboarding-continue"]').click();
      cy.location("pathname", { timeout: 15_000 }).should(
        "not.match",
        /^\/auth(\/|$)/
      );

      cy.reload();
      cy.location("pathname").should("not.eq", "/auth/onboarding");
      cy.window().then((win) => {
        expect(win.localStorage.getItem("lunaris_pending_onboarding")).to.be
          .null;
        expect(win.localStorage.getItem("lunaris_onboarding_completed")).to.eq(
          "true"
        );
      });
    });
  });
});
