/// <reference path="../../support/index.d.ts" />

function assertPanelSpacing(testid: string) {
  cy.get(`[data-testid="${testid}"]`).should(($panel) => {
    const children = $panel[0].children;
    expect(children.length, `${testid} direct children`).to.be.greaterThan(1);
    const gap =
      children[1].getBoundingClientRect().top -
      children[0].getBoundingClientRect().bottom;
    expect(gap, `${testid} first-gap`).to.be.greaterThan(8);
  });
}

describe("settings/verified", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("covers organization billing, account update, security change, and storage smoke", () => {
    cy.registerVerifiedUser().then(({ email, password }) => {
      const nextPassword = "password123-next";
      const nextName = "Updated E2E User";

      cy.visit("/");
      cy.location("pathname", { timeout: 15_000 })
        .should("match", /^\/[^/]+\/?$/)
        .then((root) => {
          const organizationSlug = root.replace(/^\//, "").replace(/\/$/, "");
          cy.visit(`/${organizationSlug}/settings?tab=billing`);
          cy.get('[data-testid="organization-panel-billing"]').should(
            "be.visible"
          );
          assertPanelSpacing("organization-panel-billing");
          cy.get('[data-testid="organization-billing-refresh"]')
            .should("be.visible")
            .and("not.be.disabled")
            .click();
        });

      cy.openSettings();
      cy.openSettingsTab("preferences");
      assertPanelSpacing("settings-panel-preferences");

      cy.openSettingsTab("account");
      assertPanelSpacing("settings-panel-account");
      cy.intercept("POST", "**/auth/update-user").as("updateUser");
      cy.get('[data-testid="settings-account-name"]').clear().type(nextName).blur();
      cy.wait("@updateUser").its("response.statusCode").should("eq", 200);

      cy.visit("/");
      cy.openSettings();
      cy.openSettingsTab("account");
      cy.get('[data-testid="settings-account-name"]').should(
        "have.value",
        nextName
      );

      cy.visit("/");
      cy.openSettings();
      cy.openSettingsTab("account");
      assertPanelSpacing("settings-panel-security");
      cy.get('[data-testid="settings-panel-security"]')
        .find('[aria-label="Refresh"]')
        .should("not.exist");
      cy.get('[data-testid="settings-security-password"]')
        .find("button")
        .click();
      cy.get('[data-testid="change-password-dialog"]').within(() => {
        cy.get('[data-testid="settings-security-current-password"]').type(
          password,
          { log: false }
        );
        cy.get(
          '[data-testid="settings-security-change-new-password"]'
        ).type(nextPassword, { log: false });
        cy.get(
          '[data-testid="settings-security-change-confirm-password"]'
        ).type("wrong-password", { log: false });
        cy.get('[data-testid="settings-security-password-mismatch"]').should(
          "be.visible"
        );
        cy.get(
          '[data-testid="settings-security-change-password-submit"]'
        ).should("be.disabled");
        cy.get(
          '[data-testid="settings-security-change-confirm-password"]'
        )
          .clear()
          .type(nextPassword, { log: false });
        cy.get(
          '[data-testid="settings-security-change-password-submit"]'
        ).click();
      });
      cy.get('[data-testid="change-password-dialog"]').should("not.exist");

      cy.signOut();
      cy.signIn({
        email,
        password: nextPassword,
      });

      cy.visit("/");
      cy.openSettings();
      cy.openSettingsTab("local-data");
      assertPanelSpacing("settings-local-data-overview");
      cy.get('[data-testid="settings-local-data-no-pending"]').should(
        "be.visible"
      );
      cy.get('[data-testid="settings-local-data-clear-queue"]').should(
        "be.disabled"
      );
    });
  });
});
