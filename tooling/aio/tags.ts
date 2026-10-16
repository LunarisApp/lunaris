const releaseTag =
  /^aio-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

export function versionFromTag(tag: string) {
  if (tag.trim() !== tag || !releaseTag.test(tag) || tag.length > 120) {
    throw new Error(`Invalid AIO release tag: ${tag}`);
  }
  return tag.slice(5);
}

export function publicationTags(tag: string, sha: string, knownTags: string[]) {
  const version = versionFromTag(tag);
  if (sha.length !== 40 || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error("Expected full commit SHA");
  }
  const tags = [version, `sha-${sha}`];
  if (version.includes("-")) {
    return tags;
  }
  const [major, minor] = version.split(".");
  const stable = knownTags
    .filter((entry) => releaseTag.test(entry) && !entry.slice(5).includes("-"))
    .map((entry) => entry.slice(5));
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
