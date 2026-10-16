/// <reference path="../../support/index.d.ts" />

export {};

function renameNewItem(name: string) {
  cy.get('input[aria-label="Rename resource"]')
    .clear()
    .type(`${name}{enter}`);
}

describe("extensions/persistence", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("restores Kanban and Excalidraw documents from cloud storage", () => {
    cy.registerVerifiedUser({ prefix: "extensions" }).then(({ email, password }) => {
      cy.visit("/");
      cy.createWorkspace({ name: "Extension Workspace" });
      cy.get('[data-testid="workspaces-list-item-extension-workspace"]').click();
      cy.location("pathname")
        .should("match", /\/extension-workspace$/)
        .then((workspacePath) => {
          cy.intercept("POST", "**/v1/sync/ingest").as("boardSync");
          cy.get('button[aria-label="Add file"]').click();
          cy.contains('[role="menuitem"]', "Kanban").click();
          cy.contains("button", "Add Task", { timeout: 15_000 }).should(
            "be.visible",
          );
          renameNewItem("Release Board");
          cy.contains("button", "Add Task").click();
          cy.get('input[placeholder="Task title"]').type("Ship manuscript");
          cy.get('[role="dialog"]').contains("button", "Create").click();
          cy.contains("Ship manuscript", { timeout: 15_000 }).should("be.visible");
          cy.wait("@boardSync").its("response.statusCode").should("eq", 200);
          cy.get("body").type("{esc}");
          cy.get('[role="dialog"]').should("not.exist");

          cy.intercept("POST", "**/v1/sync/ingest", (request) => {
            if (JSON.stringify(request.body).includes("Story Map")) {
              request.alias = "storyMapSync";
            }
          });
          cy.get('button[aria-label="Add file"]').click();
          cy.contains('[role="menuitem"]', "Excalidraw").click();
          cy.get(
            'iframe[data-lunaris-plugin-sandbox="lunaris.excalidraw"]',
            { timeout: 30_000 },
          ).should("be.visible");
          renameNewItem("Story Map");
          cy.wait("@storyMapSync", { timeout: 30_000 })
            .its("response.statusCode")
            .should("eq", 200);

          cy.signOut();
          cy.resetE2eState();
          cy.signIn({ email, password });
          cy.visit("/");
          cy.get('[data-testid="workspaces-list-item-extension-workspace"]', {
            timeout: 30_000,
          }).click();
          cy.location("pathname").should("eq", workspacePath);
          cy.contains('[data-testid="workspace-tree-item"]', "Release Board", {
            timeout: 30_000,
          }).click();
          cy.contains("Ship manuscript", { timeout: 30_000 }).should("be.visible");
          cy.contains('[data-testid="workspace-tree-item"]', "Story Map").click();
          cy.get(
            'iframe[data-lunaris-plugin-sandbox="lunaris.excalidraw"]',
            { timeout: 30_000 },
          ).should("be.visible");
        });
    });
  });
});
