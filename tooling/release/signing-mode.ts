import { appendFileSync } from "node:fs";

export const appleSecretNames = [
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_API_ISSUER",
  "APPLE_API_KEY",
  "APPLE_API_PRIVATE_KEY",
] as const;

export type SigningMode = "adhoc" | "signed";

export function selectSigningMode(
  environment: Record<string, string | undefined>
): "signed" {
  const present = appleSecretNames.filter((name) => environment[name]);
  if (present.length === 0) {
    throw new Error(
      "Stable releases require Apple Developer ID signing and notarization credentials"
    );
  }

  const missing = appleSecretNames.filter((name) => !environment[name]);
  if (missing.length > 0) {
    throw new Error(
      `Partial Apple signing configuration. Missing: ${missing.join(", ")}`
    );
  }

  if (
    !environment.APPLE_SIGNING_IDENTITY?.startsWith("Developer ID Application:")
  ) {
    throw new Error(
      "APPLE_SIGNING_IDENTITY must be a Developer ID Application identity"
    );
  }

  return "signed";
}

if (import.meta.main) {
  const mode = selectSigningMode(process.env);
  const output = process.env.GITHUB_OUTPUT;
  if (!output) {
    throw new Error("GITHUB_OUTPUT is required");
  }
  appendFileSync(output, `mode=${mode}\n`);
  console.log(
    "Apple credentials validated; using Developer ID signing and notarization."
  );
}
