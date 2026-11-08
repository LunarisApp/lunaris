import { afterEach, describe, expect, it } from "vitest";
import { captureResourceSelection } from "./webmcp-selection";

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

function select(text: Text, start = 0, end = text.length) {
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function editor() {
  document.body.innerHTML =
    '<div data-lunaris-rich-text-resource="active"><div class="bn-editor"><p>Hello world</p></div><span>Toolbar</span></div><input type="password" value="secret">';
  const text = document.querySelector("p")!.firstChild as Text;
  select(text, 0, 5);
  return text;
}

describe("resource editor selection", () => {
  it("captures text only inside the active resource editor", () => {
    editor();
    expect(captureResourceSelection(document, "active")?.text).toBe("Hello");
    expect(captureResourceSelection(document, "other")).toBeNull();
    select(document.querySelector("span")!.firstChild as Text);
    expect(captureResourceSelection(document, "active")).toBeNull();
  });

  it("invalidates changed selections, content and detached views", () => {
    const text = editor();
    const snapshot = captureResourceSelection(document, "active")!;
    expect(snapshot.isCurrent()).toBe(true);
    select(text, 1, 4);
    expect(snapshot.isCurrent()).toBe(false);
    select(text, 0, 5);
    text.appendData("!");
    expect(snapshot.isCurrent()).toBe(false);
    document.body.replaceChildren();
    expect(snapshot.isCurrent()).toBe(false);
  });

  it("rejects collapsed and oversized selections", () => {
    const text = editor();
    select(text, 0, 0);
    expect(captureResourceSelection(document, "active")).toBeNull();
    text.data = "a".repeat(100_001);
    select(text);
    expect(captureResourceSelection(document, "active")).toBeNull();
  });
});
