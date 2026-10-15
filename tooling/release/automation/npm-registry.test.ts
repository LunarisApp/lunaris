import { expect, test } from "bun:test";
import { ensureNpmPublication } from "./npm-registry";

test("partial publication resumes missing packages without republishing successful ones", async () => {
  const registry = new Map<string, string>();
  const published: string[] = [];
  let fail = true;
  const ship = async () => {
    for (const name of ["sdk", "ui"]) {
      await ensureNpmPublication(`${name}@1.0.0`, name, async () => registry.get(name) ?? null, () => {
        if (name === "ui" && fail) throw new Error("Registry unavailable");
        published.push(name);
        registry.set(name, name);
      });
    }
  };
  await expect(ship()).rejects.toThrow("Registry unavailable");
  expect(published).toEqual(["sdk"]);
  fail = false;
  await ship();
  await ship();
  expect(published).toEqual(["sdk", "ui"]);
});

test("conflicting bytes and uncertain readback never overwrite a published version", async () => {
  let writes = 0;
  await expect(ensureNpmPublication("sdk@1.0.0", "wanted", async () => "other", () => { writes++; })).rejects.toThrow("different bytes");
  expect(writes).toBe(0);
  await expect(ensureNpmPublication("sdk@1.0.0", "wanted", async () => null, () => { writes++; })).rejects.toThrow("readback failed");
  expect(writes).toBe(1);
});
