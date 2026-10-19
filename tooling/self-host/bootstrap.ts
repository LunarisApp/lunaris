import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function renderBootstrap(version: string, sha256: string) {
  if (!(/^\d+\.\d+\.\d+$/.test(version) && /^[a-f0-9]{64}$/.test(sha256))) {
    throw new Error("Invalid installer release metadata");
  }
  return readFileSync(
    resolve(import.meta.dirname, "../../infra/self-host/bootstrap.sh"),
    "utf8"
  )
    .replace("__LUNARIS_VERSION__", version)
    .replace("__LUNARIS_SHA256__", sha256);
}
