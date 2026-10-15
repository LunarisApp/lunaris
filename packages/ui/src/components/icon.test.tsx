import { File01Icon } from "../icons";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Icon } from "./icon";

describe("Icon", () => {
  it("forwards Hugeicons stroke width", () => {
    const markup = renderToStaticMarkup(
      <Icon icon={File01Icon} strokeWidth={2} />
    );

    expect(markup).toContain('stroke-width="2"');
  });

  it("sizes and hides custom SVG elements", () => {
    const markup = renderToStaticMarkup(
      <Icon className="size-5" icon={<svg data-brand-icon="true" />} />
    );

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("[&amp;&gt;svg]:size-full size-5");
    expect(markup).toContain('data-brand-icon="true"');
  });
});
