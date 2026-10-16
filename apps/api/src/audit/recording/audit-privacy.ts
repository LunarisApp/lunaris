import ipaddr from "ipaddr.js";
import { sanitizeAuditText } from "./audit-log";

export function anonymizeIpAddress(value: string): string {
  if (!ipaddr.isValid(value)) {
    return "[invalid-ip]";
  }
  const address = ipaddr.process(value);
  if (address instanceof ipaddr.IPv4) {
    return [...address.octets.slice(0, 3), 0].join(".");
  }
  return new ipaddr.IPv6([
    ...address.parts.slice(0, 4),
    0,
    0,
    0,
    0,
  ]).toNormalizedString();
}

export function sanitizeAuditUserAgent(value: string): string {
  return sanitizeAuditText(value) ?? "[unknown]";
}
