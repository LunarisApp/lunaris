import { describe, expect, it } from "bun:test";
import sharp from "sharp";
import {
  generateExtensionIcon,
  resolveHugeicon,
} from "./generate-extension-icon";

describe("generate extension icon", () => {
  it("resolves exact, shorthand, and kebab-case Hugeicons names", () => {
    expect(resolveHugeicon("NoteIcon").name).toBe("NoteIcon");
    expect(resolveHugeicon("note").name).toBe("NoteIcon");
    expect(resolveHugeicon("note-icon").name).toBe("NoteIcon");
  });

  it("suggests nearby names for unknown icons", () => {
    expect(() => resolveHugeicon("NteIcon")).toThrow(
      /Did you mean: .*NoteIcon/,
    );
  });

  it("renders a square WebP with opaque corners", async () => {
    const { definition } = resolveHugeicon("NoteIcon");
    const webp = await generateExtensionIcon({ definition, size: 64 });
    const image = sharp(webp);
    const metadata = await image.metadata();
    const { data, info } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(64);
    expect(metadata.height).toBe(64);
    expect(info.channels).toBe(4);
    expect(data[3]).toBe(255);
    expect(data[(32 * 64 + 32) * 4 + 3]).toBe(255);
  });

  it("renders PNG for extension artifact compatibility", async () => {
    const { definition } = resolveHugeicon("NoteIcon");
    const png = await generateExtensionIcon({
      definition,
      format: "png",
      size: 64,
    });

    expect((await sharp(png).metadata()).format).toBe("png");
  });
});
