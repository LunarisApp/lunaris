import { describe, expect, it } from "bun:test";
import { buildBackupReadyEmail } from "./email.service";

describe("buildBackupReadyEmail", () => {
  it("builds an authenticated app deep link without exposing storage URL", () => {
    const email = buildBackupReadyEmail({
      backupId: "backup_123",
      expiresAt: new Date("2026-07-16T10:00:00.000Z"),
      frontendUrl: "https://app.lunaris.test/base",
      organizationName: "Acme & Co",
      organizationSlug: "acme",
      recipientName: "Ada <Owner>",
    });

    expect(email.downloadPageUrl).toBe(
      "https://app.lunaris.test/acme/settings?tab=backups&backup=backup_123",
    );
    expect(email.html).toContain("Ada &lt;Owner&gt;");
    expect(email.html).toContain("Acme &amp; Co");
    expect(email.html).not.toContain("storage");
  });

  it("strips line breaks from email subject", () => {
    const email = buildBackupReadyEmail({
      backupId: "backup_123",
      expiresAt: new Date("2026-07-16T10:00:00.000Z"),
      frontendUrl: "https://app.lunaris.test",
      organizationName: "Acme\r\nBcc: attacker@example.com",
      organizationSlug: "acme",
      recipientName: "Ada",
    });

    expect(email.subject).not.toMatch(/[\r\n]/);
  });
});
