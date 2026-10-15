import { describe, expect, it } from "vitest";
import { getTemplateById } from "./templates";

describe("workspace templates", () => {
  it("enables file support for book workspaces", () => {
    expect(getTemplateById("book")?.plugins).toEqual([
      "lunaris.rich-text",
      "lunaris.file",
    ]);
  });
});
