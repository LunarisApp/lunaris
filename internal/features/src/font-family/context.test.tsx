import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { FontFamilyProvider, useFontFamily } from "./context";

function TestConsumer() {
  const { fontFamily, setFontFamily } = useFontFamily();
  return (
    <div>
      <span data-testid="family">{fontFamily}</span>
      <button data-testid="set-serif" onClick={() => setFontFamily("serif")}>
        Serif
      </button>
      <button
        data-testid="set-dyslexic"
        onClick={() => setFontFamily("dyslexic")}
      >
        Dyslexic
      </button>
      <button
        data-testid="set-default"
        onClick={() => setFontFamily("default")}
      >
        Default
      </button>
    </div>
  );
}

describe("FontFamilyProvider", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  it("defaults to default when no stored value", () => {
    render(
      <FontFamilyProvider>
        <TestConsumer />
      </FontFamilyProvider>
    );
    expect(screen.getByTestId("family").textContent).toBe("default");
  });

  it("reads initial value from localStorage", () => {
    localStorage.setItem("lunaris.fontFamily", "serif");
    render(
      <FontFamilyProvider>
        <TestConsumer />
      </FontFamilyProvider>
    );
    expect(screen.getByTestId("family").textContent).toBe("serif");
  });

  it("setFontFamily updates state and localStorage", async () => {
    const user = userEvent.setup();
    render(
      <FontFamilyProvider>
        <TestConsumer />
      </FontFamilyProvider>
    );
    await user.click(screen.getByTestId("set-serif"));
    expect(screen.getByTestId("family").textContent).toBe("serif");
    expect(localStorage.getItem("lunaris.fontFamily")).toBe("serif");
  });

  it("applies CSS class to document.documentElement", async () => {
    const user = userEvent.setup();
    render(
      <FontFamilyProvider>
        <TestConsumer />
      </FontFamilyProvider>
    );
    await user.click(screen.getByTestId("set-dyslexic"));
    expect(
      document.documentElement.classList.contains("font-family-dyslexic")
    ).toBe(true);
  });

  it("removes previous font-family class when changing", async () => {
    const user = userEvent.setup();
    render(
      <FontFamilyProvider>
        <TestConsumer />
      </FontFamilyProvider>
    );
    await user.click(screen.getByTestId("set-serif"));
    expect(
      document.documentElement.classList.contains("font-family-serif")
    ).toBe(true);

    await user.click(screen.getByTestId("set-dyslexic"));
    expect(
      document.documentElement.classList.contains("font-family-serif")
    ).toBe(false);
    expect(
      document.documentElement.classList.contains("font-family-dyslexic")
    ).toBe(true);
  });

  it("always applies font-family class including default", async () => {
    render(
      <FontFamilyProvider>
        <TestConsumer />
      </FontFamilyProvider>
    );
    expect(
      document.documentElement.classList.contains("font-family-default")
    ).toBe(true);
  });
});

describe("useFontFamily", () => {
  it("throws when used outside provider", () => {
    expect(() => {
      render(<TestConsumer />);
    }).toThrow("useFontFamily must be used within FontFamilyProvider");
  });
});
