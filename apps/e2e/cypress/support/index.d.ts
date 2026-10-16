/// <reference types="cypress" />

declare global {
  namespace Cypress {
    type SettingsTab = "account" | "billing" | "local-data" | "preferences";

    interface Chainable {
      /** Opens and accepts the latest invitation email sent to this address. */
      acceptInvitationViaLog(email: string): Chainable<void>;

      /** Clears state, signs in as guest, and waits for the seeded welcome workspace. */
      bootstrapWorkspacesPage(): Chainable<void>;

      /** Clears PowerSync OPFS and IndexedDB while preserving server data. */
      clearClientData(): Chainable<void>;

      /** Creates a workspace through the real dialog and waits for its list card. */
      createWorkspace(args: {
        name: string;
        slug?: string;
      }): Chainable<{ name: string; slug: string }>;

      /** Opens account settings from the user menu and waits for the page. */
      openSettings(): Chainable<void>;

      /** Switches settings tab and waits for matching panel. */
      openSettingsTab(tab: SettingsTab): Chainable<void>;

      /** Opens the per-workspace options menu via the hover-reveal trigger. */
      openWorkspaceOptions(slug: string): Chainable<void>;

      /** Fills the signup form and submits. Asserts redirect off /auth/register. */
      register(args: {
        name: string;
        email: string;
        password: string;
      }): Chainable<void>;

      /** Registers, verifies, and returns fresh user creds. */
      registerVerifiedUser(args?: {
        name?: string;
        password?: string;
        prefix?: string;
      }): Chainable<{ email: string; name: string; password: string }>;

      /** Submits /auth/forgot-password and asserts the success state. */
      requestPasswordReset(email: string): Chainable<void>;

      /** beforeEach helper: clear cookies + local/session storage. */
      resetE2eState(): Chainable<void>;

      /** Reads the reset URL from backend.log, fills the form, submits. */
      resetPasswordViaLog(args: {
        email: string;
        newPassword: string;
      }): Chainable<void>;

      /** Fills /auth/email and submits. Asserts redirect away from /auth. */
      signIn(args: { email: string; password: string }): Chainable<void>;

      /** Starts a guest session. Asserts redirect away from /auth. */
      signInAnonymous(): Chainable<void>;

      /** POST /auth/sign-out + clear cookies/storage. */
      signOut(options?: { clearCookies?: boolean }): Chainable<void>;
      /** Generates a unique e2e-only email like `e2e-1712000000000-1@e2e.lunaris.app`. */
      uniqueEmail(prefix?: string): Chainable<string>;

      /** Reads the verification URL from backend.log and visits it. */
      verifyEmailViaLog(email: string): Chainable<void>;
    }
  }
}

export {};
