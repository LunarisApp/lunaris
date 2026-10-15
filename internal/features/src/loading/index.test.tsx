import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoaderView } from "./index";

describe("LoaderView", () => {
  it("renders one busy status with the default label", () => {
    const { container } = render(<LoaderView />);

    const status = screen.getByRole("status", {
      name: "Loading application",
    });
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getAllByRole("status")).toHaveLength(1);

    const spinner = container.querySelector("svg");
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
    expect(spinner?.getAttribute("role")).toBe("presentation");
    expect(spinner?.classList.contains("size-10")).toBe(true);
  });

  it("uses a custom accessible label", () => {
    render(<LoaderView label="Loading organization" />);

    expect(
      screen.getByRole("status", { name: "Loading organization" }),
    ).toBeTruthy();
  });
});
