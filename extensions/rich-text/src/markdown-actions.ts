import type { PluginResourceReadContext } from "@lunarisapp/plugin-sdk";
import { createError } from "evlog";
import { compileBlockNoteMarkdown } from "./yjs-compile";

export type ChatProvider = "chatgpt" | "claude";

export const MAX_CHAT_URL_LENGTH = 8_000;

const CHAT_PROVIDERS: Record<
  ChatProvider,
  {
    baseUrl: string;
    createUrl: (markdown: string) => string;
  }
> = {
  chatgpt: {
    baseUrl: "https://chatgpt.com/",
    createUrl: (markdown) =>
      `https://chatgpt.com/?${new URLSearchParams({
        hints: "search",
        prompt: markdown,
      })}`,
  },
  claude: {
    baseUrl: "https://claude.ai/new",
    createUrl: (markdown) =>
      `https://claude.ai/new?${new URLSearchParams({ q: markdown })}`,
  },
};

export interface OpenPageInChatResult {
  copiedToClipboard: boolean;
  prefilled: boolean;
}

export function createChatUrl(
  provider: ChatProvider,
  markdown: string
): string {
  return CHAT_PROVIDERS[provider].createUrl(markdown);
}

export async function copyPageAsMarkdown(
  context: PluginResourceReadContext,
  resourceId: string
): Promise<void> {
  const markdown = await compileBlockNoteMarkdown(context, resourceId);
  await navigator.clipboard.writeText(markdown);
}

export async function openPageInChat(
  context: PluginResourceReadContext,
  resourceId: string,
  provider: ChatProvider,
  targetWindow: Window | null
): Promise<OpenPageInChatResult> {
  const markdown = await compileBlockNoteMarkdown(context, resourceId);
  const providerConfig = CHAT_PROVIDERS[provider];
  const chatUrl = providerConfig.createUrl(markdown);
  const prefilled = chatUrl.length <= MAX_CHAT_URL_LENGTH;

  if (!prefilled) {
    await navigator.clipboard.writeText(markdown);
  }

  const destination = prefilled ? chatUrl : providerConfig.baseUrl;
  if (targetWindow) {
    targetWindow.location.href = destination;
  } else {
    const openedWindow = window.open(destination, "_blank");
    if (!openedWindow) {
      throw createError({
        message: "Unable to open page in chat",
        why: "The browser blocked the new tab",
        fix: "Allow pop-ups for Lunaris and try again",
      });
    }
    openedWindow.opener = null;
  }

  return {
    copiedToClipboard: !prefilled,
    prefilled,
  };
}
