export function parseUpdaterPublicKey(publicKey: string): Buffer {
  const lines = Buffer.from(publicKey, "base64")
    .toString("utf8")
    .trim()
    .split("\n");
  const key = Buffer.from(lines[1] ?? "", "base64");
  if (
    !lines[0]?.startsWith("untrusted comment:") ||
    key.length !== 42 ||
    key.subarray(0, 2).toString() !== "Ed"
  ) {
    throw new Error(
      "TAURI_UPDATER_PUBLIC_KEY must contain the base64-encoded Tauri public key file"
    );
  }
  return key;
}

// Tauri only warns on a mismatched key. Reject it before publishing installers
// whose embedded public key would reject subsequent updates from this signer.
export function assertUpdaterSigningKey(publicKey: string, signature: string) {
  const key = parseUpdaterPublicKey(publicKey);
  const lines = Buffer.from(signature.trim(), "base64")
    .toString("utf8")
    .trim()
    .split("\n");
  const signed = Buffer.from(lines[1] ?? "", "base64");
  if (
    !lines[0]?.startsWith("untrusted comment:") ||
    signed.length !== 74 ||
    !["Ed", "ED"].includes(signed.subarray(0, 2).toString())
  ) {
    throw new Error("Invalid Tauri updater signature");
  }
  if (!signed.subarray(2, 10).equals(key.subarray(2, 10))) {
    throw new Error(
      "Updater signing key does not match the configured public key"
    );
  }
}
