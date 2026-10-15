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
): SigningMode {
  const present = appleSecretNames.filter((name) => environment[name]);
  if (present.length === 0) return "adhoc";

  const missing = appleSecretNames.filter((name) => !environment[name]);
  if (missing.length > 0) {
    throw new Error(
      `Partial Apple signing configuration. Missing: ${missing.join(", ")}`
    );
  }

  return "signed";
}

if (import.meta.main) {
  const mode = selectSigningMode(process.env);
  const output = process.env.GITHUB_OUTPUT;
  if (!output) throw new Error("GITHUB_OUTPUT is required");
  appendFileSync(output, `mode=${mode}\n`);
  console.log(
    mode === "signed"
      ? "Complete Apple credentials found; using Developer ID signing and notarization."
      : "Apple credentials absent; using ad-hoc signing."
  );
}
