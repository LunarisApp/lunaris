import { describe, expect, it } from "bun:test";
import { anonymizeIpAddress, sanitizeAuditUserAgent } from "./audit-privacy";

describe("anonymizeIpAddress", () => {
  it("removes IPv4 host identity", () => {
    expect(anonymizeIpAddress("192.0.2.123")).toBe("192.0.2.0");
  });

  it("removes IPv6 interface identity", () => {
    expect(anonymizeIpAddress("2001:db8:abcd:12:34:56:78:90")).toBe(
      "2001:db8:abcd:12:0:0:0:0"
    );
  });

  it("does not preserve malformed forwarded values", () => {
    expect(anonymizeIpAddress("not-an-ip")).toBe("[invalid-ip]");
  });

  it("scrubs user-agent PII added after evlog redaction", () => {
    expect(sanitizeAuditUserAgent("client owner@example.com")).toBe(
      "client [email]"
    );
  });
});
