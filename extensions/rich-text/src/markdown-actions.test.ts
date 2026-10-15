import type { PluginResourceReadContext } from "@lunarisapp/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compileMarkdown: vi.fn(),
}));

vi.mock("./yjs-compile", () => ({
  compileBlockNoteMarkdown: mocks.compileMarkdown,
}));

import {
  copyPageAsMarkdown,
  createChatUrl,
  MAX_CHAT_URL_LENGTH,
  openPageInChat,
} from "./markdown-actions";

const db = { getAll: vi.fn() } as unknown as PluginResourceReadContext;
const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  mocks.compileMarkdown.mockResolvedValue("# Workspace notes\n");
  vi.stubGlobal("navigator", { clipboard: { writeText } });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("rich-text Markdown actions", () => {
  it("copies compiled Markdown", async () => {
    await copyPageAsMarkdown(db, "doc-1");

    expect(mocks.compileMarkdown).toHaveBeenCalledWith(db, "doc-1");
    expect(writeText).toHaveBeenCalledWith("# Workspace notes\n");
  });

  it.each([
    ["chatgpt", "https://chatgpt.com/", "prompt"],
    ["claude", "https://claude.ai/new", "q"],
  ] as const)("builds a %s prefilled URL", (provider, origin, queryKey) => {
    const url = new URL(createChatUrl(provider, "# Workspace notes"));

    expect(`${url.origin}${url.pathname}`).toBe(origin);
    expect(url.searchParams.get(queryKey)).toBe("# Workspace notes");
  });

  it("opens a short page as a prefilled chat", async () => {
    const targetWindow = {
      location: { href: "about:blank" },
    } as Window;

    const result = await openPageInChat(
      db,
      "doc-1",
      "chatgpt",
      targetWindow
    );

    expect(targetWindow.location.href).toContain("https://chatgpt.com/");
    expect(targetWindow.location.href).toContain("prompt=%23+Workspace+notes");
    expect(writeText).not.toHaveBeenCalled();
    expect(result).toEqual({ copiedToClipboard: false, prefilled: true });
  });

  it("copies a long page and opens an empty chat", async () => {
    const markdown = "x".repeat(MAX_CHAT_URL_LENGTH);
    const targetWindow = {
      location: { href: "about:blank" },
    } as Window;
    mocks.compileMarkdown.mockResolvedValue(markdown);

    const result = await openPageInChat(
      db,
      "doc-1",
      "claude",
      targetWindow
    );

    expect(writeText).toHaveBeenCalledWith(markdown);
    expect(targetWindow.location.href).toBe("https://claude.ai/new");
    expect(result).toEqual({ copiedToClipboard: true, prefilled: false });
  });

  it("opens a new tab when a pre-opened window is unavailable", async () => {
    const openedWindow = { location: { href: "" }, opener: {} };
    const open = vi.fn(() => openedWindow);
    vi.stubGlobal("window", { open });

    await openPageInChat(db, "doc-1", "claude", null);

    expect(open).toHaveBeenCalledWith(
      expect.stringContaining("https://claude.ai/new?"),
      "_blank"
    );
    expect(openedWindow.opener).toBeNull();
  });

  it("reports a blocked fallback tab", async () => {
    vi.stubGlobal("window", { open: vi.fn(() => null) });

    await expect(
      openPageInChat(db, "doc-1", "claude", null)
    ).rejects.toMatchObject({
      message: "Unable to open page in chat",
      why: "The browser blocked the new tab",
    });
  });
});
