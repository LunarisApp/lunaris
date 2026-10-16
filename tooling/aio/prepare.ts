import { git, output } from "../release/automation/process";
import { remoteTags } from "./remote";
import { versionFromTag } from "./tags";

const tag = process.env.AIO_TAG ?? "";
const version = versionFromTag(tag);
git("fetch", "origin", "main", "next", "--tags");
const sha = git("rev-parse", `refs/tags/${tag}^{commit}`);
if (remoteTags().get(tag) !== sha) {
  throw new Error("Release tag is missing or moved on origin");
}
const branch = version.includes("-") ? "next" : "main";
git("merge-base", "--is-ancestor", sha, `origin/${branch}`);
output("sha", sha);
output("version", version);
