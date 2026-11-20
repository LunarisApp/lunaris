/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { CodeBlock, CodeBlockContent, CodeBlockCopyButton } from "./code-block";

afterEach(cleanup);

it("copies the complete source with Enter and preserves focus and blank lines", async () => {
  const source = "first\n\nthird\n";
  const user = userEvent.setup();
  const { container } = render(
    <CodeBlock>
      <CodeBlockCopyButton value={source} />
      <CodeBlockContent lineNumbers startLine={5}>
        {source}
      </CodeBlockContent>
    </CodeBlock>
  );

  const button = screen.getByRole("button", { name: "Copy" });
  await user.tab();
  expect(document.activeElement).toBe(button);
  await user.keyboard("{Enter}");
  expect(await navigator.clipboard.readText()).toBe(source);
  expect(screen.getByRole("button", { name: "Copied" })).toBe(button);
  expect(document.activeElement).toBe(button);
  await user.tab();
  const pre = container.querySelector("pre");
  expect(document.activeElement).toBe(pre);
  expect(pre?.style.counterReset).toBe("line 4");
  expect(
    Array.from(
      container.querySelectorAll('[data-slot="code-block-line"]'),
      (line) => line.textContent
    )
  ).toEqual(["first", "\n", "third"]);
});

it("respects a cancelled copy", async () => {
  const user = userEvent.setup();
  render(
    <CodeBlockCopyButton
      onClick={(event) => event.preventDefault()}
      value="new"
    />
  );
  await navigator.clipboard.writeText("old");
  await user.click(screen.getByRole("button", { name: "Copy" }));
  expect(await navigator.clipboard.readText()).toBe("old");
  expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
});
