/// <reference path="../../support/index.d.ts" />

describe("settings/navigation", () => {
  function pressSettingsHotkey() {
    cy.window({ log: false }).then((win) => {
      const isMac = /Mac|iPhone|iPad|iPod/i.test(win.navigator.platform);
      const eventInit: KeyboardEventInit = {
        bubbles: true,
        cancelable: true,
        ctrlKey: !isMac,
        key: ",",
        metaKey: isMac,
      };
      win.document.dispatchEvent(new win.KeyboardEvent("keydown", eventInit));
      win.dispatchEvent(new win.KeyboardEvent("keydown", eventInit));
    });
  }

  beforeEach(() => {
    cy.bootstrapWorkspacesPage();
  });

  it("opens from the user menu, hides billing for guests, and routes claim CTA to email signup", () => {
    cy.openSettings();
    cy.get('[data-testid="settings-tab-account"]').should("be.visible");
    cy.get('[data-testid="settings-tab-security"]').should("not.exist");
    cy.get('[data-testid="settings-tab-preferences"]').should("be.visible");
    cy.get('[data-testid="settings-tab-local-data"]').should("be.visible");
    cy.get('[data-testid="settings-tab-billing"]').should("not.exist");

    cy.openSettingsTab("account");
    cy.get('[data-testid="settings-account-claim-email"]').click();
    cy.location("pathname").should("eq", "/auth/register");
  });

  it("opens app settings from the hotkey outside a workspace", () => {
    pressSettingsHotkey();

    cy.location("pathname").should("eq", "/settings/account");
    cy.get('[data-testid="settings-page"]').should("be.visible");
  });

  it("opens app settings from the hotkey inside a workspace", () => {
    cy.get('[data-testid="workspaces-list-item-welcome"]').click();
    cy.get('[data-testid="workspace-settings-trigger"]').should("be.visible");

    pressSettingsHotkey();

    cy.location("pathname").should("eq", "/settings/account");
    cy.get('[data-testid="settings-page"]').should("be.visible");
    cy.get('[data-testid="workspace-settings-panel"]').should("not.exist");
  });
});
