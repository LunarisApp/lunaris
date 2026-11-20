/** @vitest-environment happy-dom */

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { highlightCode } from "@lunarisapp/ui/lib/highlighter";
import { useHighlightedCode } from "./use-highlighted-code";

afterEach(cleanup);

it("preserves grammar state as code streams and resets for replacement text or language", async () => {
  const { result, rerender } = renderHook(
    ({ code, lang }) => useHighlightedCode(code, lang),
    { initialProps: { code: "/* a comment\nstill", lang: "ts" } }
  );
  expect(result.current).toEqual(["/* a comment", "still"]);
  const expected = await highlightCode("/* a comment\nstill", "ts");
  await waitFor(() =>
    expect(result.current.map((line) => renderToStaticMarkup(line))).toEqual(
      expected?.map((line) => renderToStaticMarkup(line))
    )
  );

  const code = "/* a comment\nstill inside */\nconst n = 1";
  rerender({ code, lang: "ts" });
  expect(result.current.map((line) => renderToStaticMarkup(line))).toEqual(
    (await highlightCode(code, "typescript"))?.map((line) =>
      renderToStaticMarkup(line)
    )
  );

  rerender({ code: "unrelated\n", lang: "ts" });
  expect(result.current.map((line) => renderToStaticMarkup(line))).toEqual(
    (await highlightCode("unrelated", "ts"))?.map((line) =>
      renderToStaticMarkup(line)
    )
  );
  rerender({ code: "plain\n\ntext\n", lang: "constructor" });
  expect(result.current).toEqual(["plain", "", "text"]);
  expect(await highlightCode("plain", "constructor")).toBeNull();
});

it("renders a multiline ANSI snippet without including the escape codes", async () => {
  const lines = await highlightCode("\u001b[31mred\u001b[0m\nplain", "ansi");
  expect(
    lines?.map((line) => line.map((token) => token.props.children).join(""))
  ).toEqual(["red", "plain"]);
});
