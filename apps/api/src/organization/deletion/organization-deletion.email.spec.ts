import { describe, expect, it } from "bun:test";
import { buildOrganizationDeletionEmail } from "./organization-deletion.email";

describe("organization deletion email", () => {
  const params = {
    organizationName: 'Acme & <script>alert("x")</script>',
    purgeAfter: new Date("2026-10-08T12:05:00.000Z"),
    recoveryUrl: "https://app.lunaris.test/acme?region=eu&source=email",
    reminder: false,
  };

  it("groups both formats and renders an explicit UTC deadline", () => {
    const email = buildOrganizationDeletionEmail(params);
    for (const content of [email.text, email.html]) {
      expect(content).toContain("October 8, 2026 at 12:05 PM UTC");
      expect(content).toContain("Restore your organization");
      expect(content).toContain("Billing");
      expect(content).toContain("Offline copies");
      expect(content).toContain("Restoration does not restart billing.");
      expect(content).not.toContain("2026-10-08T");
    }
    expect(email.text).toContain(params.recoveryUrl);
  });

  it("escapes organization names and links in HTML", () => {
    const { html } = buildOrganizationDeletionEmail(params);
    expect(html).toContain("Acme &amp; &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('href="https://app.lunaris.test/acme?region=eu&amp;source=email"');
  });

  it("uses reminder heading and stable content across retries", () => {
    const input = { ...params, reminder: true };
    const email = buildOrganizationDeletionEmail(input);
    expect(email.subject).toBe("Reminder: organization deletion approaching");
    expect(email.html).toContain(email.subject);
    expect(email).toEqual(buildOrganizationDeletionEmail(input));
  });
});
