import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyStoredAppearance,
  readStoredFontFamily,
  readStoredFontSize,
} from ".";

describe("stored appearance", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("applies persisted appearance before render", () => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("lunaris.fontFamily", "dyslexic");
    localStorage.setItem("lunaris.fontSize", "extra-large");

    applyStoredAppearance();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      document.documentElement.classList.contains("font-family-dyslexic"),
    ).toBe(true);
    expect(
      document.documentElement.classList.contains("font-size-extra-large"),
    ).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("rejects invalid persisted font values", () => {
    localStorage.setItem("lunaris.fontFamily", "unknown");
    localStorage.setItem("lunaris.fontSize", "huge");

    expect(readStoredFontFamily()).toBe("default");
    expect(readStoredFontSize()).toBe("compact");
  });

  it("uses the system theme when no theme is stored", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));

    applyStoredAppearance();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
