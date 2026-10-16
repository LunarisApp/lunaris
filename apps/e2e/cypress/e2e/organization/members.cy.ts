/// <reference path="../../support/index.d.ts" />

export {};

describe("organization/members", () => {
  beforeEach(() => {
    cy.resetE2eState();
  });

  it("shares content with an invited member and revokes access on removal", () => {
    const suffix = `${Date.now()}`;
    const teamSlug = `collab-${suffix}`;

    cy.registerVerifiedUser({ prefix: "invitee" }).then((invitee) => {
      cy.signOut();
      cy.resetE2eState();

      cy.registerVerifiedUser({ prefix: "owner" }).then((owner) => {
        cy.visit("/");
        cy.get('[data-testid="organization-selector-trigger"]').click();
        cy.get('[data-testid="organization-create-trigger"]').click();
        cy.get('[data-testid="organization-create-name"]').type("Collab Team");
        cy.get('[data-testid="organization-create-slug"]')
          .clear()
          .type(teamSlug);
        cy.get('[data-testid="organization-create-submit"]').click();
        cy.location("pathname", { timeout: 15_000 }).should(
          "eq",
          `/${teamSlug}`
        );
        cy.intercept("POST", "**/v1/sync/ingest").as("sharedWorkspaceSync");
        cy.createWorkspace({ name: "Shared Story" });
        cy.wait("@sharedWorkspaceSync")
          .its("response.statusCode")
          .should("eq", 200);

        cy.request(
          "GET",
          "http://localhost:3000/auth/organization/get-full-organization"
        ).then(({ body: organization }) => {
          expect(organization.slug).to.eq(teamSlug);
          cy.request({
            body: {
              email: invitee.email,
              organizationId: organization.id,
              role: "editor",
            },
            headers: { Origin: "http://localhost:5173" },
            method: "POST",
            url: "http://localhost:3000/auth/organization/invite-member",
          });
        });
        cy.visit(`/${teamSlug}/settings?tab=members`);
        cy.contains(invitee.email, { timeout: 15_000 }).should("be.visible");

        cy.signOut();
        cy.resetE2eState();
        cy.signIn({ email: invitee.email, password: invitee.password });
        cy.acceptInvitationViaLog(invitee.email);
        cy.location("pathname", { timeout: 15_000 }).should(
          "eq",
          `/${teamSlug}`
        );
        cy.get('[data-testid="workspaces-list-item-shared-story"]', {
          timeout: 30_000,
        }).click();
        cy.intercept("POST", "**/v1/sync/ingest").as("memberWriteSync");
        cy.get('button[aria-label="Add file"]').click();
        cy.contains('[role="menuitem"]', "Rich Text").click();
        cy.wait("@memberWriteSync", { timeout: 30_000 })
          .its("response.statusCode")
          .should("eq", 200);

        cy.signOut();
        cy.resetE2eState();
        cy.signIn({ email: owner.email, password: owner.password });
        cy.visit(`/${teamSlug}/shared-story`);
        cy.contains('[data-testid="workspace-tree-item"]', "Untitled", {
          timeout: 30_000,
        }).should("be.visible");

        cy.visit(`/${teamSlug}/settings?tab=members`);
        cy.get(
          `[data-testid="organization-member-row"][data-member-email="${invitee.email}"]`
        ).within(() => {
          cy.get('[role="combobox"]').click();
        });
        cy.contains('[role="option"]', "Viewer").click({ force: true });
        cy.get(
          `[data-testid="organization-member-row"][data-member-email="${invitee.email}"]`
        ).should("contain.text", "Viewer");
        cy.get(
          `[data-testid="organization-member-row"][data-member-email="${invitee.email}"]`
        ).within(() => {
          cy.contains("button", "Remove").click();
        });
        cy.get('[role="alertdialog"]').contains("button", "Remove").click();
        cy.get(
          `[data-testid="organization-member-row"][data-member-email="${invitee.email}"]`
        ).should("not.exist");

        cy.signOut();
        cy.resetE2eState();
        cy.signIn({ email: invitee.email, password: invitee.password });
        cy.visit(`/${teamSlug}`);
        cy.contains("Organization not found", { timeout: 15_000 }).should(
          "be.visible"
        );
      });
    });
  });
});
