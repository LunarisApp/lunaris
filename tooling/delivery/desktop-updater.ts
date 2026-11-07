export type DesktopGroup = "desktop" | "desktop-windows" | "desktop-linux";

export function desktopAssetNames(
  version: string,
  group: DesktopGroup,
  adhoc = false
) {
  const base = `Lunaris-desktop-${version}-`;
  const installer =
    group === "desktop"
      ? `${base}universal${adhoc ? "-adhoc" : ""}.dmg`
      : group === "desktop-windows"
        ? `${base}x86_64-pc-windows-msvc.exe`
        : `${base}x86_64-unknown-linux-gnu.deb`;
  const update =
    group === "desktop"
      ? `${base}universal${adhoc ? "-adhoc" : ""}.app.tar.gz`
      : group === "desktop-windows"
        ? installer
        : `${base}x86_64-unknown-linux-gnu.AppImage`;
  return { installer, update, signature: `${update}.sig` };
}

export function completeDesktopAssets(
  version: string,
  group: DesktopGroup,
  names: string[]
) {
  return [false, true].some((adhoc) => {
    const expected = new Set(
      Object.values(desktopAssetNames(version, group, adhoc))
    );
    return (
      names.length === expected.size &&
      new Set(names).size === expected.size &&
      names.every((name) => expected.has(name))
    );
  });
}

export function createDesktopUpdateManifest(
  version: string,
  repository: string,
  names: string[],
  readSignature: (name: string) => string
) {
  const platforms: Record<string, { url: string; signature: string }> = {};
  for (const [group, targets] of [
    ["desktop", ["darwin-aarch64", "darwin-x86_64"]],
    ["desktop-windows", ["windows-x86_64"]],
    ["desktop-linux", ["linux-x86_64"]],
  ] as const) {
    const adhoc =
      group === "desktop" &&
      names.includes(desktopAssetNames(version, group, true).installer);
    const assets = desktopAssetNames(version, group, adhoc);
    if (!Object.values(assets).every((name) => names.includes(name))) {
      throw new Error(`Missing signed updater assets for ${group}`);
    }
    const signature = readSignature(assets.signature).trim();
    if (!signature) {
      throw new Error(`Empty updater signature: ${assets.signature}`);
    }
    for (const target of targets) {
      platforms[target] = {
        url: `https://github.com/${repository}/releases/download/v${version}/${assets.update}`,
        signature,
      };
    }
  }
  return { version, platforms };
}
