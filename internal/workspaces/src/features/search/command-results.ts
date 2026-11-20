import { Terminal } from "@lunarisapp/ui/icons";
import { formatHotkeyDisplay } from "@repo/features/hotkeys";
import type { CommandId } from "./commands";
import { COMMANDS } from "./commands";
import {
  getSearchTerms,
  hasScopedSearchTerms,
  getSearchMatch,
  parseSearchQuery,
} from "./query";
import type { CommandSearchResult } from "./types";

export type CommandActions = Partial<Record<CommandId, () => void>>;

export function buildCommandSearchResults(
  query: string,
  actions: CommandActions,
  t: (key: string) => string,
  resourceCommands: readonly CommandSearchResult[] = []
): CommandSearchResult[] {
  const parsedQuery = parseSearchQuery(query);
  if (hasScopedSearchTerms(parsedQuery)) {
    return [];
  }
  const terms = getSearchTerms(parsedQuery, null);

  const commands = Object.values(COMMANDS).flatMap((definition) => {
    const action = actions[definition.id];
    if (!action) {
      return [];
    }
    if (terms.length === 0 && definition.suggestOnEmpty === false) {
      return [];
    }

    const label = t(definition.nameKey);
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
  return [...commands, ...resourceCommands].flatMap(
    (command: CommandSearchResult) => {
      const match = getSearchMatch(
        [command.label, command.searchAlias ?? ""],
        terms
      );
      if (!match) {
        return [];
      }
      return match === "substring"
        ? { ...command, substringMatch: true }
        : command;
    }
  );
}
