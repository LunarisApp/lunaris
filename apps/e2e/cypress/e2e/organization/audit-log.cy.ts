/// <reference path="../../support/index.d.ts" />

export {};

describe("organization/audit-log", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("reviews and filters curated organization audit events", () => {
    cy.registerVerifiedUser({ prefix: "audit-log" }).then(() => {
      cy.visit("/");
      cy.get('[data-testid="workspaces-page"]').should("be.visible");
      cy.location("pathname").then((organizationPath) => {
        cy.intercept("POST", "**/v1/sync/ingest").as("auditWorkspaceSync");
        cy.createWorkspace({ name: "Audited Workspace" });
        cy.wait("@auditWorkspaceSync")
          .its("response.statusCode")
          .should("eq", 200);

        cy.intercept("GET", "**/v1/audit-events*").as("auditEvents");
        cy.visit(`${organizationPath}/settings?tab=audit`);
        cy.wait("@auditEvents").then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
          expect(response?.body.items).to.be.an("array").and.not.be.empty;
          const item = response?.body.items[0];
          expect(item).to.have.all.keys(
            "action",
            "actorId",
            "actorType",
            "changedFields",
            "id",
            "occurredAt",
            "outcome",
            "reason",
            "requestId",
            "targetId",
            "targetType",
            "traceId",
          );
          for (const field of [
            "changes",
            "context",
            "event",
            "signature",
            "tenantId",
          ]) {
            expect(item).to.not.have.property(field);
          }
        });

        cy.get('[data-testid="audit-event-row"]').first().should("be.visible");
        cy.get('[data-testid="audit-log-section"]')
          .contains("button", "View")
          .first()
          .click();
        cy.contains("Audit event details").should("be.visible");
        cy.get('[data-slot="sheet-close"]').click();

        cy.get('input[aria-label="Action"]', { timeout: 15_000 })
          .should("not.be.disabled")
          .type("sync.ingested");
        cy.get('[data-testid="audit-log-section"]')
          .contains("button", "Apply filters")
          .click();
        cy.wait("@auditEvents").its("request.query.action").should(
          "eq",
          "sync.ingested",
        );
        cy.get('[data-testid="audit-event-row"] code')
          .first()
          .should("have.text", "sync.ingested");
      });
    });
  });
});
