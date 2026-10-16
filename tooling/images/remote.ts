import { git } from "../release/automation/process";

export function parseRemoteTags(listing: string) {
  const tags = new Map<string, string>();
  const peeled = new Map<string, string>();
  for (const line of listing.trim().split("\n")) {
    const match = /^([a-f0-9]{40})\s+refs\/tags\/(.+?)(\^\{\})?$/.exec(line);
    if (!match) {
      continue;
    }
    (match[3] ? peeled : tags).set(match[2]!, match[1]!);
  }
  return new Map([...tags, ...peeled]);
}

export function remoteTags() {
  // fetch --tags retains deleted local tags; publication must use live refs.
  return parseRemoteTags(git("ls-remote", "--tags", "origin"));
}
