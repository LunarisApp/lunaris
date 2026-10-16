const CANCELLED_PASSKEY_CODES = new Set([
  "AUTH_CANCELLED",
  "ERROR_CEREMONY_ABORTED",
  "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
  "REGISTRATION_CANCELLED",
]);

export function getPasskeyErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function isPasskeyCancellation(error: unknown): boolean {
  return CANCELLED_PASSKEY_CODES.has(getPasskeyErrorCode(error) ?? "");
}
