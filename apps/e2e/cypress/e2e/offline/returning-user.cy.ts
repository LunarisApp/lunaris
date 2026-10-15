/// <reference types="cypress" />

function emulateOffline(offline: boolean) {
  return cy.then(() =>
    Cypress.automation("remote:debugger:protocol", {
      command: "Network.emulateNetworkConditions",
      params: {
        offline,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      },
    })
  );
}

function waitForServiceWorkerControl() {
  cy.window().then(async (win) => {
    await win.navigator.serviceWorker.ready;
  });
  cy.reload();
  cy.window().its("navigator.serviceWorker.controller").should("not.be.null");
}

function waitForEditorPersistence() {
  cy.get("[data-yjs-persistence-state]", { timeout: 15_000 }).should(
    "have.attr",
    "data-yjs-persistence-state",
    "idle"
  );
}

const documentBodySelector =
  '[data-yjs-persistence-state] .bn-block-content[data-content-type="paragraph"] .bn-inline-content';
const documentHeadingSelector =
  '[data-yjs-persistence-state] .bn-block-content[data-content-type="heading"]';

function waitForDocumentHeading(name: string) {
  return cy
    .contains(documentHeadingSelector, name, { timeout: 15_000 })
    .should("be.visible");
}

function getDocumentBody() {
  return cy
    .get(documentBodySelector, { timeout: 15_000 })
    .last()
    .should("be.visible");
}

function getDocumentBodyContaining(text: string) {
  return cy
    .contains(documentBodySelector, text, { timeout: 15_000 })
    .should("be.visible");
}

describe("returning-user offline PWA", () => {
  afterEach(() => {
    emulateOffline(false);
  });

  it("opens and edits cached content across offline reloads", () => {
    cy.bootstrapWorkspacesPage();
    cy.createWorkspace({ name: "Offline Draft" });

    // Install the complete app while only the workspaces route has been visited.
    // Opening the editor offline then proves its lazy chunks were precached.
    waitForServiceWorkerControl();
    emulateOffline(true);

    cy.get('[data-testid="workspaces-list-item-offline-draft"]').click();

    cy.get('button[aria-label="Add file"]').click();
    cy.contains('[role="menuitem"]', "Rich Text").click();
    cy.get('input[aria-label="Rename resource"]')
      .clear()
      .type("Field Notes{enter}");
    waitForDocumentHeading("Field Notes");
    getDocumentBody().click().type("Written offline");
    getDocumentBodyContaining("Written offline");
    waitForEditorPersistence();

    let encryptionKeyRequests = 0;
    cy.intercept("GET", "**/v1/client/encryption-key", () => {
      encryptionKeyRequests += 1;
    });

    cy.reload();
    getDocumentBodyContaining("Written offline")
      .click()
      .type("{end} and extended offline");
    getDocumentBodyContaining("Written offline and extended offline");
    waitForEditorPersistence();

    cy.reload();
    getDocumentBodyContaining("Written offline and extended offline");
    cy.then(() => expect(encryptionKeyRequests).to.equal(0));

    emulateOffline(false);
    cy.window().then((win) => {
      win.dispatchEvent(new Event("online"));
    });
    getDocumentBodyContaining("Written offline and extended offline");
  });
});
