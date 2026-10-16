import { Terminal } from "@lunarisapp/ui/icons";
import { formatHotkeyDisplay } from "@repo/features/hotkeys";
import type { CommandId } from "./commands";
import { COMMANDS } from "./commands";
import {
  getSearchTerms,
  hasScopedSearchTerms,
  matchesSearchTerms,
  parseSearchQuery,
} from "./query";
import type { CommandSearchResult } from "./types";

export type CommandActions = Partial<Record<CommandId, () => void>>;

export function buildCommandSearchResults(
  query: string,
  actions: CommandActions,
  t: (key: string) => string
): CommandSearchResult[] {
  const parsedQuery = parseSearchQuery(query);
  if (hasScopedSearchTerms(parsedQuery)) {
    return [];
  }
  const terms = getSearchTerms(parsedQuery, null);

  return Object.values(COMMANDS).flatMap((definition) => {
    const action = actions[definition.id];
    if (!action) {
      return [];
    }
    if (terms.length === 0 && definition.suggestOnEmpty === false) {
      return [];
    }

    const label = t(definition.nameKey);
    if (!matchesSearchTerms([label], terms)) {
      return [];
    }

    return {
      id: `cmd-${definition.id}`,
      type: "command" as const,
      label,
      shortcut: definition.hotkeyId
        ? formatHotkeyDisplay(definition.hotkeyId)
        : undefined,
      icon: definition.icon ?? Terminal,
      action,
    };
  });
}
