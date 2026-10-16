import { beforeEach, describe, expect, it, vi } from "vitest";

const { registerEmojiSource } = vi.hoisted(() => ({
  registerEmojiSource: vi.fn(),
}));

vi.mock("@react-pdf/renderer", () => ({
  Font: { registerEmojiSource },
}));

import {
  preparePdfEmojiDataUrls,
  registerPdfEmojiSource,
  renderEmojiDataUrl,
} from "./emoji";

const clearRect = vi.fn();
const fillText = vi.fn();
const measureText = vi.fn(() => ({
  actualBoundingBoxAscent: 60,
  actualBoundingBoxDescent: 20,
  actualBoundingBoxLeft: 10,
  actualBoundingBoxRight: 70,
}));
const context = {
  clearRect,
  fillText,
  font: "",
  measureText,
  textAlign: "",
  textBaseline: "",
};
const toDataURL = vi.fn(() => "data:image/png;base64,emoji");
const canvas = {
  getContext: vi.fn(() => context),
  height: 0,
  toDataURL,
  width: 0,
};

describe("PDF emoji source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas),
    });
  });

  it("renders code points into a centered PNG", () => {
    expect(renderEmojiDataUrl("1f350")).toBe("data:image/png;base64,emoji");
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(128);
    expect(context.font).toContain("Apple Color Emoji");
    expect(context.textAlign).toBe("left");
    expect(context.textBaseline).toBe("alphabetic");
    expect(measureText).toHaveBeenCalledWith("🍐");
    expect(fillText).toHaveBeenCalledWith("🍐", 34, 84);
    expect(toDataURL).toHaveBeenCalledWith("image/png");
  });

  it("preserves variation selectors and joined sequences", () => {
    renderEmojiDataUrl("2764-fe0f-200d-1f525");
    expect(fillText).toHaveBeenCalledWith(
      "❤️‍🔥",
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("registers canvas rendering with React PDF", () => {
    registerPdfEmojiSource();
    expect(registerEmojiSource).toHaveBeenCalledWith({
      builder: renderEmojiDataUrl,
      withVariationSelectors: true,
    });
  });

  it("prepares unique emoji images before worker rendering", () => {
    expect(
      preparePdfEmojiDataUrls([
        {
          sections: [
            { text: "Pear 🍐 twice 🍐", type: "paragraph" },
            { text: "Fire ❤️‍🔥", type: "paragraph" },
          ],
          title: "Emoji",
        },
      ])
    ).toEqual({
      "1f350": "data:image/png;base64,emoji",
      "2764-fe0f-200d-1f525": "data:image/png;base64,emoji",
    });
    expect(toDataURL).toHaveBeenCalledTimes(2);
  });

  it("registers prepared worker-safe emoji sources", () => {
    registerPdfEmojiSource({ "1f350": "data:image/png;base64,pear" });
    const registration = registerEmojiSource.mock.calls.at(-1)?.[0];

    expect(registration.builder("1f350")).toBe("data:image/png;base64,pear");
    expect(() => registration.builder("1f525")).toThrow(
      "Missing prepared PDF emoji"
    );
  });
});
