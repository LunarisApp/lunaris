const releaseVersion =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

export function versionFromTag(tag: string, prefix = "aio-v") {
  const version = tag.slice(prefix.length);
  if (
    tag.trim() !== tag ||
    !(tag.startsWith(prefix) && releaseVersion.test(version)) ||
    version.length > 115
  ) {
    throw new Error(`Invalid image release tag: ${tag}`);
  }
  return version;
}

export function publicationTags(
  tag: string,
  sha: string,
  knownTags: string[],
  prefix = "aio-v"
) {
  const version = versionFromTag(tag, prefix);
  if (sha.length !== 40 || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error("Expected full commit SHA");
  }
  const tags = [version, `sha-${sha}`];
  if (version.includes("-")) {
    return tags;
  }
  const [major, minor] = version.split(".");
  const stable = knownTags
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => entry.slice(prefix.length))
    .filter((entry) => releaseVersion.test(entry) && !entry.includes("-"));
  const newer = (prefix: string) =>
    stable.some(
      (entry) =>
        entry.startsWith(prefix) && Bun.semver.order(entry, version) > 0
    );
  if (!newer(`${major}.${minor}.`)) {
    tags.push(`${major}.${minor}`);
  }
  if (!newer(`${major}.`)) {
    tags.push(major!);
  }
  if (!newer("")) {
    tags.push("latest");
  }
  return tags;
}
