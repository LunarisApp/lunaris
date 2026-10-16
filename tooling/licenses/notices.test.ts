import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectNotices } from "./notices";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture(name = "example", version = "1.0.0") {
  const root = mkdtempSync(join(tmpdir(), "lunaris-notices-"));
  roots.push(root);
  const directory = join(root, "node_modules", name);
  mkdirSync(join(directory, "dist"), { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name, version, license: "MIT" })
  );
  writeFileSync(join(directory, "dist/package.json"), '{"type":"module"}');
  writeFileSync(join(directory, "dist/index.js"), "export default 1;");
  return { root, directory, input: join(directory, "dist/index.js") };
}
test("retains LICENSE, NOTICE and nested texts through anonymous manifests", () => {
  const f = fixture();
  writeFileSync(
    join(f.directory, "LICENSE"),
    "Copyright Example\nPermission granted."
  );
  writeFileSync(join(f.directory, "NOTICE.txt"), "Required attribution");
  mkdirSync(join(f.directory, "licenses/nested"), { recursive: true });
  writeFileSync(
    join(f.directory, "licenses/nested/vendor.txt"),
    "Vendor attribution"
  );
  const text = collectNotices(
    [f.input, `${f.input}?query`, "\0virtual"],
    f.root
  );
  expect(text).toContain("Copyright Example\nPermission granted.");
  expect(text).toContain("Required attribution");
  expect(text).toContain("Vendor attribution");
  expect(text.match(/## example@1.0.0/g)).toHaveLength(1);
});
test("fails on missing texts and empty graphs", () => {
  const f = fixture();
  expect(() => collectNotices([f.input], f.root)).toThrow(
    "Missing license text"
  );
  expect(() => collectNotices(["\0virtual"], f.root)).toThrow(
    "No third-party packages"
  );
});
test("Pi license override is pinned to the reviewed version", () => {
  const f = fixture("@mariozechner/pi-ai", "0.73.1");
  expect(collectNotices([f.input], f.root)).toContain("Mario Zechner");
  const next = fixture("@mariozechner/pi-ai", "0.74.0");
  expect(() => collectNotices([next.input], next.root)).toThrow(
    "Missing license text"
  );
});
test("fails on conflicting texts for identical package versions", () => {
  const a = fixture();
  const b = fixture();
  writeFileSync(join(a.directory, "LICENSE"), "First copyright");
  writeFileSync(join(b.directory, "LICENSE"), "Different copyright");
  expect(() => collectNotices([a.input, b.input], a.root)).toThrow(
    "Conflicting license texts"
  );
});

test("subpath manifests cannot hide the owning package license", () => {
  const f = fixture("@scope/owner");
  writeFileSync(
    join(f.directory, "dist/package.json"),
    '{"name":"@scope/owner/subpath","version":"1"}'
  );
  writeFileSync(join(f.directory, "LICENSE"), "Owner copyright");
  expect(collectNotices([f.input], f.root)).toContain("## @scope/owner@1.0.0");
});
test("review exceptions remain visible and do not cover new versions", () => {
  const f = fixture("fontkit", "2.0.4");
  expect(collectNotices([f.input], f.root)).toContain(
    "UPSTREAM LICENSE TEXT REQUIRES REVIEW"
  );
  const next = fixture("fontkit", "2.0.5");
  expect(() => collectNotices([next.input], next.root)).toThrow(
    "Missing license text"
  );
});
