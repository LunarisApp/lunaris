"use client";

import type { IconSvgObject } from "@lunarisapp/ui/icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  buildCommandSearchResults,
  type CommandActions,
} from "../command-results";
import type { CommandSearchResult } from "../types";

export interface CommandAction {
	action: () => void;
	icon?: IconSvgObject;
	id: string;
	label: string;
	shortcut?: string;
}

/**
 * Hook to search commands by label.
 * @param query Search query string
 * @param actions Map of command id to callback
 */
export function useCommandSearch(
	query: string,
	actions: CommandActions,
): CommandSearchResult[] {
	const { t } = useTranslation();

	return useMemo(() => {
		return buildCommandSearchResults(query, actions, t);
	}, [query, actions, t]);
}

export type { CommandActions };
