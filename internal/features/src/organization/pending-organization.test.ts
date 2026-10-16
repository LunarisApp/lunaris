/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingOrganization,
  markPendingOrganization,
  readPendingOrganization,
} from "./pending-organization";

const CURRENT_KEY = "lunaris_pending_organization";

describe("pending organization", () => {
  beforeEach(() => sessionStorage.clear());

  it("reads a current pending organization", () => {
    sessionStorage.setItem(
      CURRENT_KEY,
      JSON.stringify({
        createdAt: Date.now(),
        id: "org-1",
        name: "Acme",
        slug: "acme",
      })
    );

    expect(readPendingOrganization()).toEqual({
      id: "org-1",
      name: "Acme",
      slug: "acme",
    });
    expect(sessionStorage.getItem(CURRENT_KEY)).not.toBeNull();
  });

  it("writes and clears only the current marker", () => {
    markPendingOrganization({ id: "org-1", slug: "acme" });

    expect(readPendingOrganization()).toEqual({
      id: "org-1",
      name: undefined,
      slug: "acme",
    });

    clearPendingOrganization();
    expect(sessionStorage.getItem(CURRENT_KEY)).toBeNull();
  });
});
