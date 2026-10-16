export type FontFamily = "default" | "serif" | "dyslexic";
export type FontSize = "compact" | "large" | "extra-large";

export const FONT_FAMILY_STORAGE_KEY = "lunaris.fontFamily";
export const FONT_SIZE_STORAGE_KEY = "lunaris.fontSize";

const FONT_FAMILIES = new Set<FontFamily>(["default", "serif", "dyslexic"]);
const FONT_SIZES = new Set<FontSize>(["compact", "large", "extra-large"]);

function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function readStoredFontFamily(): FontFamily {
  const stored = readStorage(FONT_FAMILY_STORAGE_KEY) as FontFamily | null;
  return stored && FONT_FAMILIES.has(stored) ? stored : "default";
}

export function readStoredFontSize(): FontSize {
  const stored = readStorage(FONT_SIZE_STORAGE_KEY) as FontSize | null;
  return stored && FONT_SIZES.has(stored) ? stored : "compact";
}

export function applyFontFamily(
  root: HTMLElement,
  fontFamily: FontFamily
): void {
  root.classList.remove(
    "font-family-default",
    "font-family-serif",
    "font-family-dyslexic"
  );
  root.classList.add(`font-family-${fontFamily}`);
}

export function applyFontSize(root: HTMLElement, fontSize: FontSize): void {
  root.classList.remove(
    "font-size-compact",
    "font-size-large",
    "font-size-extra-large"
  );
  if (fontSize !== "compact") {
    root.classList.add(`font-size-${fontSize}`);
  }
}

function resolveStoredTheme(): "dark" | "light" {
  const stored = readStorage("theme");
  if (stored === "dark" || stored === "light") {
    return stored;
  }
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Apply persisted appearance before React renders its first frame. */
export function applyStoredAppearance(): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const theme = resolveStoredTheme();
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.style.colorScheme = theme;
  applyFontFamily(root, readStoredFontFamily());
  applyFontSize(root, readStoredFontSize());
}
