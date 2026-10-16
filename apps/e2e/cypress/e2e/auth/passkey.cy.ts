/// <reference path="../../support/index.d.ts" />

interface VirtualAuthenticator {
  authenticatorId: string;
}

interface KeyPress {
  code: string;
  key: string;
  windowsVirtualKeyCode: number;
}

const cdp = <Result>(command: string, params: Record<string, unknown> = {}) =>
  Cypress.automation("remote:debugger:protocol", {
    command,
    params,
  }) as Promise<Result>;

const pressKey = async (keyPress: KeyPress) => {
  await cdp("Input.dispatchKeyEvent", {
    ...keyPress,
    type: "rawKeyDown",
  });
  await cdp("Input.dispatchKeyEvent", {
    ...keyPress,
    type: "keyUp",
  });
};

describe("auth/passkey", () => {
  let authenticatorId: string | undefined;

  before(function () {
    if (Cypress.browser.family !== "chromium") {
      this.skip();
    }
  });

  beforeEach(() => {
    cy.resetE2eState();
    cy.then(async () => {
      await cdp("WebAuthn.enable");
      const authenticator = await cdp<VirtualAuthenticator>(
        "WebAuthn.addVirtualAuthenticator",
        {
          options: {
            automaticPresenceSimulation: true,
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
            protocol: "ctap2",
            transport: "internal",
          },
        }
      );
      authenticatorId = authenticator.authenticatorId;
    });
  });

  afterEach(() => {
    cy.then(async () => {
      if (authenticatorId) {
        await cdp("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
      }
      await cdp("WebAuthn.disable");
      authenticatorId = undefined;
    });
  });

  it("registers, signs in with, and removes a named passkey", () => {
    cy.registerVerifiedUser({ prefix: "passkey" }).then(() => {
      cy.visit("/");
      cy.openSettings();
      cy.openSettingsTab("account");

      cy.get('[data-testid="settings-security-passkeys"]')
        .contains("button", "Add passkey")
        .click();
      cy.get('[data-testid="settings-security-passkey-name"]')
        .clear()
        .type("Chrome virtual passkey");
      cy.get('[data-testid="passkey-add-dialog"]')
        .contains("button", "Add passkey")
        .click();
      cy.get('[data-testid="settings-security-passkey-row"]')
        .should("be.visible")
        .and("contain.text", "Chrome virtual passkey");

      cy.signOut();
      cy.intercept("GET", "**/auth/passkey/generate-authenticate-options").as(
        "passkeyOptions"
      );
      cy.visit("/auth");
      cy.window()
        .then((win) =>
          win.PublicKeyCredential.isConditionalMediationAvailable()
        )
        .should("eq", true);
      cy.wait("@passkeyOptions").its("response.statusCode").should("eq", 200);
      cy.get('[data-testid="auth-entry-email"]')
        .should("have.attr", "autocomplete", "username webauthn")
        .focus();
      cy.then(async () => {
        await pressKey({
          code: "ArrowDown",
          key: "ArrowDown",
          windowsVirtualKeyCode: 40,
        });
        await pressKey({
          code: "Enter",
          key: "Enter",
          windowsVirtualKeyCode: 13,
        });
      });
      cy.location("pathname", { timeout: 15_000 }).should(
        "not.match",
        /^\/auth(\/|$)/
      );

      cy.visit("/");
      cy.openSettings();
      cy.openSettingsTab("account");
      cy.get('[data-testid="settings-security-passkey-row"]')
        .contains("button", "Remove")
        .click();
      cy.get('[data-testid="passkey-remove-dialog"]')
        .contains("button", "Remove")
        .click();
      cy.get('[data-testid="settings-security-passkey-row"]').should(
        "not.exist"
      );
    });
  });
});
