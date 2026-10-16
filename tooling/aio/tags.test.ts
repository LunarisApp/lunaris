import { expect, test } from "bun:test";
import { publicationTags, versionFromTag } from "./tags";

const sha = "a".repeat(40);
test("stable versions publish rolling aliases and a full SHA", () => {
  expect(publicationTags("aio-v1.2.3", sha, [])).toEqual([
    "1.2.3",
    `sha-${sha}`,
    "1.2",
    "1",
    "latest",
  ]);
});
test("prereleases never move stable aliases", () => {
  expect(publicationTags("aio-v2.0.0-rc.1", sha, [])).toEqual([
    "2.0.0-rc.1",
    `sha-${sha}`,
  ]);
});
test("older releases only advance aliases in their own maintained series", () => {
  expect(
    publicationTags("aio-v1.2.3", sha, ["aio-v1.3.0", "aio-v2.0.0"])
  ).toEqual(["1.2.3", `sha-${sha}`, "1.2"]);
  expect(publicationTags("aio-v1.2.3", sha, ["aio-v1.2.10"])).toEqual([
    "1.2.3",
    `sha-${sha}`,
  ]);
});
test("prerelease and unrelated tags do not suppress stable promotion", () => {
  expect(
    publicationTags("aio-v1.2.3", sha, ["aio-v2.0.0-rc.1", "web@9.0.0"])
  ).toContain("latest");
});
test("invalid versions and refs fail before reaching shell commands", () => {
  for (const tag of [
    "v1.2.3",
    "aio-v01.2.3",
    "aio-v1.2",
    "aio-v1.2.3+build",
    "aio-v1.2.3-01",
    "aio-v1.2.3\nlatest",
    "aio-v1.2.3\n",
  ]) {
    expect(() => versionFromTag(tag)).toThrow();
  }
  expect(() => publicationTags("aio-v1.2.3", "bad", [])).toThrow();
});

test("app tags keep independent channels and reject cross-app versions", () => {
  expect(versionFromTag("api@1.2.3", "api@")).toBe("1.2.3");
  expect(() => versionFromTag("web@1.2.3", "api@")).toThrow();
  expect(
    publicationTags(
      "api@1.2.3",
      "a".repeat(40),
      ["web@9.0.0", "api@1.3.0"],
      "api@"
    )
  ).toEqual(["1.2.3", `sha-${"a".repeat(40)}`, "1.2"]);
  expect(publicationTags("web@2.0.0-rc.1", "a".repeat(40), [], "web@")).toEqual(
    ["2.0.0-rc.1", `sha-${"a".repeat(40)}`]
  );
});
