import { expect, test } from "bun:test";
import {
  completeDesktopAssets,
  createDesktopUpdateManifest,
  desktopAssetNames,
} from "./desktop-updater";
import { assetReceiptSchema } from "./product";

const groups = ["desktop", "desktop-windows", "desktop-linux"] as const;
test("feed maps universal macOS and native installers to all supported Tauri targets", () => {
  for (const adhoc of [false, true]) {
    const names = groups.flatMap((group) => [
      ...new Set(Object.values(desktopAssetNames("1.2.3", group, adhoc))),
    ]);
    const feed = createDesktopUpdateManifest(
      "1.2.3",
      "LunarisApp/lunaris",
      names,
      (name) => `signature of ${name}\n`
    );
    expect(Object.keys(feed.platforms)).toEqual([
      "darwin-aarch64",
      "darwin-x86_64",
      "windows-x86_64",
      "linux-x86_64",
    ]);
    expect(feed.platforms["darwin-aarch64"]).toEqual(
      feed.platforms["darwin-x86_64"]
    );
    expect(feed.platforms["darwin-aarch64"]?.url).toEndWith(
      `${adhoc ? "-adhoc" : ""}.app.tar.gz`
    );
    expect(feed.platforms["windows-x86_64"]?.url).toEndWith(".exe");
    expect(feed.platforms["linux-x86_64"]?.url).toEndWith(".AppImage");
    expect(feed.platforms["linux-x86_64"]?.signature).not.toEndWith("\n");
  }
});

test("feed rejects missing platform files and blank signatures", () => {
  const names = groups.flatMap((group) => [
    ...new Set(Object.values(desktopAssetNames("1.2.3", group))),
  ]);
  for (const missing of names) {
    expect(() =>
      createDesktopUpdateManifest(
        "1.2.3",
        "LunarisApp/lunaris",
        names.filter((name) => name !== missing),
        () => "signature"
      )
    ).toThrow("Missing signed updater assets");
  }
  expect(() =>
    createDesktopUpdateManifest(
      "1.2.3",
      "LunarisApp/lunaris",
      names,
      () => " \n"
    )
  ).toThrow("Empty updater signature");
});

test("signed receipts require exactly the correct platform and version files", () => {
  for (const group of groups) {
    const names = [
      ...new Set(Object.values(desktopAssetNames("1.2.3", group))),
    ];
    const receipt = {
      schemaVersion: 1,
      version: "1.2.3",
      sourceCommit: "a".repeat(40),
      producerRunId: "1",
      group,
      assets: names.map((name) => ({ name, sha256: "b".repeat(64) })),
    };
    expect(assetReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(
      assetReceiptSchema.safeParse({ ...receipt, version: "1.2.4" }).success
    ).toBe(false);
    expect(completeDesktopAssets("1.2.3", group, names.slice(0, -1))).toBe(
      false
    );
    expect(completeDesktopAssets("1.2.3", group, [...names, names[0]!])).toBe(
      false
    );
    expect(
      completeDesktopAssets(
        "1.2.3",
        group,
        names.map(() => names[0]!)
      )
    ).toBe(false);
  }
});
