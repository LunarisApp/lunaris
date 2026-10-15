/// <reference path="../../support/index.d.ts" />

export {};

describe("organization/backup", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("builds and downloads a real cloud backup archive", () => {
    cy.registerVerifiedUser({ prefix: "backup" }).then(() => {
      cy.visit("/");
      cy.get('[data-testid="workspaces-page"]').should("be.visible");
      cy.location("pathname").then((organizationPath) => {
        cy.intercept("POST", "**/v1/sync/ingest").as("backupWorkspaceSync");
        cy.createWorkspace({ name: "Backup Source" });
        cy.wait("@backupWorkspaceSync")
          .its("response.statusCode")
          .should("eq", 200);
        cy.visit(`${organizationPath}/settings?tab=backups`);
        cy.get('[data-testid="backups-section"]')
          .contains("button", "Create backup")
          .click();
        cy.contains("Backup ready", { timeout: 90_000 }).should("be.visible");

        cy.intercept("GET", "**/v1/organization/backups/*/download-url").as(
          "backupDownloadUrl",
        );
        cy.get('[data-testid="backups-section"]')
          .contains("button", "Download ZIP")
          .click();
        cy.wait("@backupDownloadUrl").then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
          const downloadUrl = response?.body.downloadUrl as string;
          cy.request({ encoding: "binary", url: downloadUrl }).then(
            (download) => {
              expect(download.status).to.eq(200);
              expect(download.body.slice(0, 2)).to.eq("PK");
            },
          );
        });
      });
    });
  });
});
