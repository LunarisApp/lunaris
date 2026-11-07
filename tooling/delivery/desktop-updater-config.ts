import { mkdirSync, writeFileSync } from "node:fs";
import { parseUpdaterPublicKey } from "./desktop-updater-signature";

// Keep private key contents in the build environment, never in config or logs.
const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();
if (!(publicKey && process.env.TAURI_SIGNING_PRIVATE_KEY)) {
  throw new Error(
    "Desktop releases require TAURI_UPDATER_PUBLIC_KEY and TAURI_SIGNING_PRIVATE_KEY"
  );
}
parseUpdaterPublicKey(publicKey);
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/desktop-updater.conf.json",
  `${JSON.stringify(
    {
      bundle: { createUpdaterArtifacts: true },
      plugins: { updater: { pubkey: publicKey } },
    },
    null,
    2
  )}\n`
);
