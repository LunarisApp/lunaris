import { imageConfig } from "./image";
import { git, output } from "../release/automation/process";
import { remoteTags } from "./remote";
import { versionFromTag } from "./tags";

const { app, prefix } = imageConfig();
const tag = process.env.IMAGE_TAG ?? "";
const version = versionFromTag(tag, prefix);
git("fetch", "origin", "main", "next", "--tags");
const sha = git("rev-parse", `refs/tags/${tag}^{commit}`);
if (remoteTags().get(tag) !== sha) {
  throw new Error("Release tag is missing or moved on origin");
}
const branch = version.includes("-") ? "next" : "main";
git("merge-base", "--is-ancestor", sha, `origin/${branch}`);
output("sha", sha);
output("version", version);

if (app !== "aio") {
  const manifest = JSON.parse(git("show", `${sha}:apps/${app}/package.json`));
  if (manifest.version !== version) {
    throw new Error("Tag and package version differ");
  }
}
output("app", app);
