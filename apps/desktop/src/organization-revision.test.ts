import { describe, expect, it } from "vitest";
import { organizationRevision } from "./organization-revision";

describe("organizationRevision", () => {
  it("matches the hosted API revision fingerprint", async () => {
    await expect(
      organizationRevision({
        logo: null,
        name: "Organization",
        slug: "organization",
      })
    ).resolves.toBe("864OsaATBduXvtapjIBGJNY94y-VYuZzORibzG5gosA");
  });
});
