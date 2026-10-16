import { describe, expect, it } from "vitest";
import { blockListToPlainText } from "./plain-text";

describe("blockListToPlainText", () => {
  it("extracts string block content", () => {
    expect(blockListToPlainText([{ content: "Hello world" }])).toBe(
      "Hello world"
    );
  });

  it("extracts inline text arrays", () => {
    expect(
      blockListToPlainText([
        {
          content: [{ text: "Hello" }, { text: ", " }, { text: "world" }],
        },
      ])
    ).toBe("Hello, world");
  });

  it("extracts nested child blocks", () => {
    expect(
      blockListToPlainText([
        {
          content: [{ text: "Parent" }],
          children: [{ content: [{ text: "Child" }] }],
        },
      ])
    ).toBe("Parent\nChild");
  });

  it("extracts native entity references as readable mentions", () => {
    expect(
      blockListToPlainText([
        {
          content: [
            {
              props: { name: "Launch plan" },
              type: "entityReference",
            },
          ],
        },
      ])
    ).toBe("@Launch plan");
  });

  it("ignores empty and unsupported content", () => {
    expect(
      blockListToPlainText([
        null,
        {},
        { content: [] },
        { content: [{ marks: ["bold"] }] },
        { content: [{ text: "  Real   text  " }] },
      ])
    ).toBe("Real text");
  });
});
