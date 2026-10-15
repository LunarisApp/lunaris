/// <reference path="../../support/index.d.ts" />

export {};

describe("settings/account deletion", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("submits a confirmed account deletion request", () => {
    cy.registerVerifiedUser({ prefix: "account-delete" }).then(({ email }) => {
      cy.visit("/");
      cy.openSettings();
      cy.openSettingsTab("account");
      cy.intercept("POST", "**/v1/account/delete-request").as(
        "accountDeleteRequest",
      );
      cy.contains("button", "Request Account Deletion").click();
      cy.get('[data-testid="input-confirm-submit"]').should("be.disabled");
      cy.get('[data-testid="input-confirm-input"]').type(email);
      cy.get('[data-testid="input-confirm-submit"]').click();
      cy.wait("@accountDeleteRequest").its("response.statusCode").should(
        "be.oneOf",
        [200, 201],
      );
    });
  });
});
