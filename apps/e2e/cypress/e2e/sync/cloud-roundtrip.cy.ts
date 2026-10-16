/// <reference path="../../support/index.d.ts" />

import { typeYjsText } from "../../support/yjs";

const documentBodySelector =
  '[data-yjs-persistence-state] .bn-block-content[data-content-type="paragraph"] .bn-inline-content';

function createDocument(name: string, body: string) {
  cy.get('button[aria-label="Add file"]').click();
  cy.contains('[role="menuitem"]', "Rich Text").click();
  cy.get('input[aria-label="Rename resource"]').clear().type(`${name}{enter}`);
  cy.contains('[data-testid="workspace-tree-item"]', name, {
    timeout: 15_000,
  }).should("be.visible");
  cy.contains('[data-testid="workspace-tree-item"]', name).click();
  cy.get(documentBodySelector, { timeout: 15_000 }).should("be.visible");
  // Reproduce the initial heading selection: the helper must move the
  // caret to the requested paragraph without changing the resource heading.
  const headingSelector =
    '.bn-block-content[data-content-type="heading"] .bn-inline-content';
  cy.get(headingSelector).click();
  typeYjsText(documentBodySelector, body);
  cy.get(headingSelector).should("have.text", name);
}

describe("sync/cloud round trip", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("restores a shared workspace and Yjs content on a clean client", () => {
    cy.registerVerifiedUser({ prefix: "cloud-roundtrip" }).then(
      ({ email, password }) => {
        cy.visit("/");
        cy.createWorkspace({ name: "Cloud Roundtrip" });
        cy.get('[data-testid="workspaces-list-item-cloud-roundtrip"]').click();
        cy.location("pathname")
          .should("match", /\/cloud-roundtrip$/)
          .then((workspacePath) => {
            const body = "Persisted through PowerSync and Yjs";
            // Resource creation uploads an empty Yjs update first. Wait for the
            // pasted text itself to be acknowledged before deleting local state.
            cy.intercept("POST", "**/v1/sync/ingest", (request) => {
              const payload = request.body as {
                transactions: {
                  crud: { type: string; data?: { update_b64?: string } }[];
                }[];
              };
              const containsText = payload.transactions.some((transaction) =>
                transaction.crud.some(
                  (entry) =>
                    entry.type === "yjs_document_updates" &&
                    entry.data?.update_b64 &&
                    atob(entry.data.update_b64).includes(body)
                )
              );
              if (containsText) {
                request.alias = "textUpload";
              }
            });
            createDocument("Cloud Note", body);
            cy.wait("@textUpload", { timeout: 30_000 })
              .its("response.statusCode")
              .should("eq", 200);

            cy.signOut();
            cy.resetE2eState();
            cy.signIn({ email, password });
            cy.visit("/");
            cy.get('[data-testid="workspaces-list-item-cloud-roundtrip"]', {
              timeout: 30_000,
            }).click();
            cy.location("pathname").should("eq", workspacePath);

            cy.contains('[data-testid="workspace-tree-item"]', "Cloud Note", {
              timeout: 30_000,
            }).click();
            cy.contains(
              documentBodySelector,
              "Persisted through PowerSync and Yjs",
              { timeout: 30_000 }
            ).should("be.visible");
          });
      }
    );
  });

  it("never downloads a local workspace to a clean client", () => {
    cy.registerVerifiedUser({ prefix: "local-isolation" }).then(
      ({ email, password }) => {
        cy.visit("/");
        cy.get('[data-testid="workspaces-create-launcher-header"]').click();
        cy.get('[data-testid="workspaces-create-option-empty"]').click();
        cy.get('[data-testid="workspaces-create-name"]').type("Private Local");
        cy.get('[data-testid="workspaces-create-visibility"]').click();
        cy.contains('[role="option"]', "Local").click();
        cy.get('[data-testid="workspaces-create-submit"]').click();
        cy.get('[data-testid="workspaces-list-item-private-local"]').should(
          "be.visible"
        );

        cy.signOut();
        cy.resetE2eState();
        cy.signIn({ email, password });
        cy.visit("/");
        cy.get('[data-testid="workspaces-page"]', { timeout: 30_000 }).should(
          "be.visible"
        );
        cy.get('[data-testid="workspaces-list-item-private-local"]').should(
          "not.exist"
        );
      }
    );
  });
});
