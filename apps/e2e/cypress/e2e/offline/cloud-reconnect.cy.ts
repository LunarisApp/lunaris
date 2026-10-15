/// <reference path="../../support/index.d.ts" />

export {};

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
    }),
  );
}

function restoreOnline() {
  return cy.then(async () => {
    await Cypress.automation("remote:debugger:protocol", {
      command: "Network.emulateNetworkConditions",
      params: {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      },
    });
    await Cypress.automation("remote:debugger:protocol", {
      command: "Network.disable",
    });
    await Cypress.automation("remote:debugger:protocol", {
      command: "Network.enable",
    });
  });
}

function waitForServiceWorkerControl() {
  cy.window().then(async (win) => {
    await win.navigator.serviceWorker.ready;
  });
  cy.reload();
  cy.window().its("navigator.serviceWorker.controller").should("not.be.null");
}

const documentBodySelector =
  '[data-yjs-persistence-state] .bn-block-content[data-content-type="paragraph"] .bn-inline-content';

describe("registered-user offline cloud sync", () => {
  afterEach(() => {
    restoreOnline();
  });

  it("retains a cloud-workspace edit across offline reload and reconnect", () => {
    cy.resetE2eState();
    cy.registerVerifiedUser({ prefix: "offline-cloud" }).then(
      () => {
        cy.visit("/");
        cy.createWorkspace({ name: "Cloud Offline" });
        cy.get('[data-testid="workspaces-list-item-cloud-offline"]').click();
        cy.location("pathname").then(() => {
          cy.get('button[aria-label="Add file"]').click();
          cy.contains('[role="menuitem"]', "Rich Text").click();
          cy.get(documentBodySelector).last().click().type("Online opening");
          cy.get("[data-yjs-persistence-state]").should(
            "have.attr",
            "data-yjs-persistence-state",
            "idle",
          );
          cy.contains(documentBodySelector, "Online opening", {
            timeout: 15_000,
          }).should("be.visible");
          waitForServiceWorkerControl();

          emulateOffline(true);
          cy.contains(documentBodySelector, "Online opening")
            .click()
            .type("{end} plus offline ending");
          cy.contains(
            documentBodySelector,
            "Online opening plus offline ending",
          ).should("be.visible");
          cy.get("[data-yjs-persistence-state]").should(
            "have.attr",
            "data-yjs-persistence-state",
            "idle",
          );
          cy.reload();
          cy.contains(
            documentBodySelector,
            "Online opening plus offline ending",
            { timeout: 15_000 },
          ).should("be.visible");

          restoreOnline();
          cy.window().then((win) =>
            win.fetch("http://localhost:3000/v1/health").then((response) => {
              expect(response.ok).to.eq(true);
            }),
          );
          cy.window().then((win) => win.dispatchEvent(new Event("online")));
          cy.contains(
            documentBodySelector,
            "Online opening plus offline ending",
            { timeout: 15_000 },
          ).should("be.visible");
        });
      },
    );
  });
});
