/// <reference types="cypress" />

// Higher-order commands that drive the real auth pages. Every command
// expects the backend + frontend dev server + docker services to be up.

let emailCounter = 0;

const toWorkspaceSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const clearOpfsStorage = () => {
  return cy.window({ log: false }).then(async (win) => {
    const storage = win.navigator.storage as
      | (StorageManager & {
          getDirectory?: () => Promise<FileSystemDirectoryHandle>;
        })
      | undefined;

    if (!storage?.getDirectory) {
      return;
    }

    const root = await storage.getDirectory();

    // PowerSync uses OPFS in worker mode; wipe the root so each test starts clean.
    for await (const [name] of root.entries()) {
      await root.removeEntry(name, { recursive: true });
    }
  });
};

const deletePowerSyncDb = () => {
  return cy.window({ log: false }).then((win) => {
    return new Cypress.Promise<void>((resolve, reject) => {
      const attemptDelete = (attempt: number) => {
        const request = win.indexedDB.deleteDatabase("lunaris.v1.db");

        request.onsuccess = () => resolve();
        request.onerror = () => {
          if (attempt >= 4) {
            reject(request.error ?? new Error("Failed to delete lunaris.v1.db"));
            return;
          }

          win.setTimeout(() => attemptDelete(attempt + 1), 400);
        };
        request.onblocked = () => {
          if (attempt >= 4) {
            reject(new Error(`lunaris.v1.db delete blocked on attempt ${attempt + 1}`));
            return;
          }

          win.setTimeout(() => attemptDelete(attempt + 1), 400);
        };
      };

      attemptDelete(0);
    });
  });
};

// Unload the application before changing its session or deleting databases.
// Visiting /auth can redirect back into the app and reopen workers mid-reset.
const visitBlankPage = () => {
  cy.intercept("GET", "/__e2e_reset__", {
    headers: { "content-type": "text/html" },
    body: "<!doctype html><html><body></body></html>",
  });
  cy.visit("/__e2e_reset__");
};

const clearPowerSyncDb = () => {
  visitBlankPage();
  clearOpfsStorage();
  deletePowerSyncDb();
};

Cypress.Commands.add("clearClientData", () => {
  clearPowerSyncDb();
});

Cypress.Commands.add("uniqueEmail", (prefix = "e2e") => {
  emailCounter += 1;
  const value = `${prefix}-${Date.now()}-${emailCounter}@e2e.lunaris.app`;
  return cy.wrap(value, { log: false });
});

Cypress.Commands.add(
  "register",
  ({ name, email, password }: { name: string; email: string; password: string }) => {
    cy.visit("/auth/register");
    cy.get('[data-testid="auth-register-name"]').clear().type(name);
    cy.get('[data-testid="auth-register-email"]').clear().type(email);
    cy.get('[data-testid="auth-register-password"]').clear().type(password, {
      log: false,
    });
    cy.get('[data-testid="auth-register-submit"]').click();
    // Better Auth signup redirects via window.location.href away from
    // /auth/register. We only assert we left the register page — where we
    // land depends on whether email verification is enabled:
    //   verification on  → /auth/verify-email
    //   verification off → VerifyEmailPage self-redirects to organization home
    cy.url({ timeout: 15_000 }).should("not.include", "/auth/register");
  }
);

Cypress.Commands.add("verifyEmailViaLog", (email: string) => {
  cy.task<string>("getAuthEmailUrl", { email, action: "verify-email" }).then(
    (url) => {
      cy.visit(url);
      // After Better Auth marks the email verified, callbackURL is `${origin}/`,
      // which in turn passes the AuthGuard.
      cy.url({ timeout: 15_000 }).should((current) => {
        const parsed = new URL(current);
        expect(parsed.origin).to.eq(new URL(Cypress.config("baseUrl")!).origin);
        expect(parsed.pathname).to.not.match(/^\/auth\/verify-email(\/|$)/);
      });
    }
  );
});

Cypress.Commands.add("acceptInvitationViaLog", (email: string) => {
  cy.task<string>("getAuthEmailUrl", {
    email,
    action: "organization-invitation",
  }).then((url) => {
    cy.visit(url);
    cy.get('[data-testid="auth-accept-invitation"]', {
      timeout: 15_000,
    }).click();
    cy.location("pathname", { timeout: 15_000 }).should(
      "not.include",
      "/auth/accept-invitation",
    );
  });
});

Cypress.Commands.add("requestPasswordReset", (email: string) => {
  cy.visit("/auth/forgot-password");
  cy.get('[data-testid="auth-forgot-email"]').clear().type(email);
  cy.get('[data-testid="auth-forgot-submit"]').click();
  cy.get('[data-testid="auth-forgot-sent"]', { timeout: 10_000 }).should(
    "be.visible"
  );
});

Cypress.Commands.add(
  "resetPasswordViaLog",
  ({ email, newPassword }: { email: string; newPassword: string }) => {
    cy.task<string>("getAuthEmailUrl", { email, action: "reset-password" }).then(
      (url) => {
        cy.visit(url);
        cy.get('[data-testid="auth-reset-password"]').clear().type(newPassword, {
          log: false,
        });
        cy.get('[data-testid="auth-reset-confirm"]').clear().type(newPassword, {
          log: false,
        });
        cy.get('[data-testid="auth-reset-submit"]').click();
        cy.url({ timeout: 15_000 }).should("match", /\/auth(?!\/reset-password)/);
      }
    );
  }
);

Cypress.Commands.add(
  "signIn",
  ({ email, password }: { email: string; password: string }) => {
    cy.visit("/auth/email");
    cy.get('[data-testid="auth-signin-email"]').clear().type(email);
    cy.get('[data-testid="auth-signin-password"]').clear().type(password, {
      log: false,
    });
    cy.get('[data-testid="auth-signin-submit"]').click();
    cy.url({ timeout: 15_000 }).should((current) => {
      const parsed = new URL(current);
      expect(parsed.pathname).to.not.match(/^\/auth(\/|$)/);
    });
  }
);

Cypress.Commands.add("signInAnonymous", () => {
  cy.visit("/auth");
  cy.get('[data-testid="auth-entry-guest"]').click();
  cy.url({ timeout: 15_000 }).should((current) => {
    const parsed = new URL(current);
    expect(parsed.pathname).to.not.match(/^\/auth(\/|$)/);
  });
});

Cypress.Commands.add("signOut", (options: { clearCookies?: boolean } = {}) => {
  visitBlankPage();
  cy.request({
    method: "POST",
    url: "http://localhost:3000/auth/sign-out",
    headers: { Origin: "http://localhost:5173" },
  });
  if (options.clearCookies !== false) cy.clearAllCookies();
  cy.clearAllLocalStorage();
  cy.clearAllSessionStorage();
});

// Called from beforeEach in specs. Clears session state. We deliberately
// do NOT truncate the backend log here: the backend's stdout fd is not in
// O_APPEND mode (shell opens with `>` not `>>`), so truncating mid-run
// leaves NUL-byte holes that corrupt later entries. Unique emails per
// test (via `uniqueEmail`) provide all the isolation we need.
Cypress.Commands.add("resetE2eState", () => {
  clearPowerSyncDb();
  cy.clearAllCookies();
  cy.clearAllLocalStorage();
  cy.clearAllSessionStorage();
});

Cypress.Commands.add("bootstrapWorkspacesPage", () => {
  cy.resetE2eState();
  cy.signInAnonymous();
  // Root redirects to `/:activeOrgSlug` (the organization home = workspaces list).
  cy.visit("/");
  cy.get('[data-testid="workspaces-page"]').should("be.visible");
  cy.get('[data-testid="workspaces-list-item-welcome"]', {
    timeout: 30_000,
  }).should("be.visible");
  cy.window({ timeout: 30_000 }).should((win) => {
    expect(
      win.localStorage.getItem("lunaris_pending_default_workspace_seed")
    ).to.be.null;
  });
});

Cypress.Commands.add(
  "registerVerifiedUser",
  ({
    name = "E2E User",
    password = "password123",
    prefix = "verified",
  }: {
    name?: string;
    password?: string;
    prefix?: string;
  } = {}) => {
    return cy.uniqueEmail(prefix).then((email) => {
      cy.register({ name, email, password });
      // Short-circuit the onboarding purpose prompt so the post-verify
      // redirect lands directly on the requested protected URL. Auth-guard
      // treats `lunaris_onboarding_completed` as terminal (see auth-guard.tsx
      // `needsOnboarding`).
      cy.window({ log: false }).then((win) => {
        win.localStorage.setItem("lunaris_onboarding_completed", "true");
      });
      cy.verifyEmailViaLog(email);
      return cy.wrap({ email, name, password }, { log: false });
    });
  }
);

Cypress.Commands.add("openSettings", () => {
  cy.get('[data-testid="user-menu-trigger"]').click();
  cy.get('[data-testid="user-menu-settings"]').click();
  cy.get('[data-testid="settings-page"]').should("be.visible");
});

Cypress.Commands.add(
  "openSettingsTab",
  (tab: "account" | "billing" | "local-data" | "preferences") => {
    cy.get(`[data-testid="settings-tab-${tab}"]`).click();
    cy.get(`[data-testid="settings-panel-${tab}"]`).should("be.visible");
  }
);

Cypress.Commands.add(
  "createWorkspace",
  ({
    name,
    slug,
  }: {
    name: string;
    slug?: string;
  }) => {
    const workspaceSlug = slug ?? toWorkspaceSlug(name);

    cy.get('[data-testid="workspaces-create-launcher-header"]').click();
    cy.get('[data-testid="workspaces-create-option-empty"]').click({
      force: true,
    });
    cy.get('[data-testid="workspaces-create-dialog"]').should("be.visible");
    cy.get('[data-testid="workspaces-create-name"]').clear().type(name);

    if (slug) {
      cy.get('[data-testid="workspaces-create-slug"]').clear().type(slug);
    } else {
      cy.get('[data-testid="workspaces-create-slug"]').should(
        "have.value",
        workspaceSlug
      );
    }

    cy.get('[data-testid="workspaces-create-submit"]').click();
    cy.get('[data-testid="workspaces-create-dialog"]').should("not.exist");
    cy.get(`[data-testid="workspaces-list-item-${workspaceSlug}"]`).should(
      "be.visible"
    );

    return cy.wrap({ name, slug: workspaceSlug }, { log: false });
  }
);

Cypress.Commands.add("openWorkspaceOptions", (slug: string) => {
  cy.get(`[data-testid="workspaces-list-item-${slug}"]`)
    .scrollIntoView()
    .parent()
    .within(() => {
      cy.get('[data-testid="workspaces-options-trigger"]').click();
    });
});

export {};
