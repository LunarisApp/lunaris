import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { FontSizeProvider, useFontSize } from "./context";

function TestConsumer() {
  const { fontSize, setFontSize } = useFontSize();
  return (
    <div>
      <span data-testid="size">{fontSize}</span>
      <button data-testid="set-large" onClick={() => setFontSize("large")}>
        Large
      </button>
      <button
        data-testid="set-extra-large"
        onClick={() => setFontSize("extra-large")}
      >
        Extra Large
      </button>
      <button data-testid="set-compact" onClick={() => setFontSize("compact")}>
        Compact
      </button>
    </div>
  );
}

describe("FontSizeProvider", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  it("defaults to compact when no stored value", () => {
    render(
      <FontSizeProvider>
        <TestConsumer />
      </FontSizeProvider>
    );
    expect(screen.getByTestId("size").textContent).toBe("compact");
  });

  it("reads initial value from localStorage", () => {
    localStorage.setItem("lunaris.fontSize", "large");
    render(
      <FontSizeProvider>
        <TestConsumer />
      </FontSizeProvider>
    );
    expect(screen.getByTestId("size").textContent).toBe("large");
  });

  it("setFontSize updates state and localStorage", async () => {
    const user = userEvent.setup();
    render(
      <FontSizeProvider>
        <TestConsumer />
      </FontSizeProvider>
    );
    await user.click(screen.getByTestId("set-large"));
    expect(screen.getByTestId("size").textContent).toBe("large");
    expect(localStorage.getItem("lunaris.fontSize")).toBe("large");
  });

  it("applies CSS class to document.documentElement", async () => {
    const user = userEvent.setup();
    render(
      <FontSizeProvider>
        <TestConsumer />
      </FontSizeProvider>
    );
    await user.click(screen.getByTestId("set-extra-large"));
    expect(
      document.documentElement.classList.contains("font-size-extra-large")
    ).toBe(true);
  });

  it("removes previous font-size class when changing", async () => {
    const user = userEvent.setup();
    render(
      <FontSizeProvider>
        <TestConsumer />
      </FontSizeProvider>
    );
    await user.click(screen.getByTestId("set-large"));
    expect(document.documentElement.classList.contains("font-size-large")).toBe(
      true
    );

    await user.click(screen.getByTestId("set-extra-large"));
    expect(document.documentElement.classList.contains("font-size-large")).toBe(
      false
    );
    expect(
      document.documentElement.classList.contains("font-size-extra-large")
    ).toBe(true);
  });

  it("does not add class for compact (default)", async () => {
    const user = userEvent.setup();
    render(
      <FontSizeProvider>
        <TestConsumer />
      </FontSizeProvider>
    );
    await user.click(screen.getByTestId("set-large"));
    await user.click(screen.getByTestId("set-compact"));
    expect(
      document.documentElement.classList.contains("font-size-compact")
    ).toBe(false);
    expect(document.documentElement.classList.contains("font-size-large")).toBe(
      false
    );
  });
});

describe("useFontSize", () => {
  it("throws when used outside provider", () => {
    expect(() => {
      render(<TestConsumer />);
    }).toThrow("useFontSize must be used within FontSizeProvider");
  });
});
