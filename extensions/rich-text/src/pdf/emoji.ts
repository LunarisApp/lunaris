import { Font } from "@react-pdf/renderer";
import emojiRegex from "emoji-regex-xs";
import type { PdfContent } from "./content";

const EMOJI_IMAGE_SIZE = 128;
const EMOJI_FONT_SIZE = 96;
const EMOJI_FONT_FAMILY =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

function decodeCodePoints(code: string): string {
  return code
    .split("-")
    .map((value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .join("");
}

function encodeCodePoints(value: string): string {
  return Array.from(value)
    .map((character) => character.codePointAt(0)?.toString(16))
    .join("-");
}

export type PdfEmojiDataUrls = Record<string, string>;

export function renderEmojiDataUrl(code: string): string {
  if (typeof document === "undefined") {
    throw new Error("PDF emoji rendering requires browser canvas support");
  }

  const canvas = document.createElement("canvas");
  canvas.width = EMOJI_IMAGE_SIZE;
  canvas.height = EMOJI_IMAGE_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("PDF emoji rendering requires a 2D canvas context");
  }

  context.clearRect(0, 0, EMOJI_IMAGE_SIZE, EMOJI_IMAGE_SIZE);
  context.font = `${EMOJI_FONT_SIZE}px ${EMOJI_FONT_FAMILY}`;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";

  const emoji = decodeCodePoints(code);
  const metrics = context.measureText(emoji);
  const x =
    EMOJI_IMAGE_SIZE / 2 +
    (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2;
  const y =
    EMOJI_IMAGE_SIZE / 2 +
    (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  context.fillText(emoji, x, y);

  return canvas.toDataURL("image/png");
}

export function preparePdfEmojiDataUrls(
  contents: PdfContent[]
): PdfEmojiDataUrls {
  const result: PdfEmojiDataUrls = {};
  const seen = new WeakSet<object>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      for (const match of value.matchAll(emojiRegex())) {
        const code = encodeCodePoints(match[0]);
        result[code] ??= renderEmojiDataUrl(code);
      }
      return;
    }
    if (!value || typeof value !== "object" || seen.has(value)) {
      return;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    for (const item of Object.values(value)) {
      visit(item);
    }
  };
  visit(contents);
  return result;
}

export function registerPdfEmojiSource(emojiDataUrls?: PdfEmojiDataUrls): void {
  Font.registerEmojiSource({
    builder: emojiDataUrls
      ? (code) => {
          const source = emojiDataUrls[code];
          if (!source) {
            throw new Error(`Missing prepared PDF emoji: ${code}`);
          }
          return source;
        }
      : renderEmojiDataUrl,
    withVariationSelectors: true,
  });
}
