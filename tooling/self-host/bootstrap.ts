import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function renderBootstrap(
  version: string,
  sha256: string,
  tag = `self-hosted@${version}`
) {
  if (!(/^\d+\.\d+\.\d+$/.test(version) && /^[a-f0-9]{64}$/.test(sha256))) {
    throw new Error("Invalid installer release metadata");
  }
  if (tag !== `v${version}` && tag !== `self-hosted@${version}`) {
    throw new Error("Invalid installer tag");
  }
  return (
    readFileSync(
      resolve(import.meta.dirname, "../../infra/self-host/bootstrap.sh"),
      "utf8"
    )
      .replace("__LUNARIS_VERSION__", version)
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal shell variable in installer template.
      .replace("self-hosted%40${version}", encodeURIComponent(tag))
      .replace("__LUNARIS_SHA256__", sha256)
  );
}
