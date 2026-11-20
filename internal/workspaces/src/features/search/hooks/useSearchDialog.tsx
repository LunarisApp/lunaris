"use client";

import { useHotkey } from "@tanstack/react-hotkeys";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { createStore, useStore } from "zustand";
import {
  createHotkeyOptions,
  HOTKEYS,
  useResolvedHotkeyBinding,
} from "@repo/features/hotkeys";
import type { SearchCategory, SearchDialogStore } from "../types";
import { SearchOrganizationContext } from "../scope";
import { SearchIndexCoordinator } from "../search-index-coordinator";

type SearchDialogStoreInstance = ReturnType<typeof createSearchDialogStore>;

const createSearchDialogStore = (inline: boolean) =>
  createStore<SearchDialogStore>((set) => ({
    // State
    createResourceInContext: null,
    isOpen: inline,
    query: "",
    category: "all" as SearchCategory,

    // Actions
    open: () => set({ isOpen: true, createResourceInContext: null }),
    dismiss: () => set({ isOpen: false, createResourceInContext: null }),
    openResourceCommands: (create) =>
      set({ isOpen: true, query: "", createResourceInContext: create }),
    close: () =>
      set({ isOpen: false, query: "", createResourceInContext: null }),
    toggle: () =>
      set((state) => ({
        isOpen: !state.isOpen,
        query: inline ? state.query : "",
        createResourceInContext: null,
      })),
    setQuery: (query) => set({ query }),
    setCategory: (category) => set({ category }),
  }));

const SearchDialogContext = createContext<SearchDialogStoreInstance | null>(
  null
);

export function SearchProvider({
  children,
  inline = false,
  indexingReady,
  organizationId,
}: {
  children: ReactNode;
  inline?: boolean;
  indexingReady: boolean;
  organizationId?: string;
}) {
  const { t } = useTranslation();
  const storeRef = useRef<SearchDialogStoreInstance | null>(null);
  if (!storeRef.current) {
    storeRef.current = createSearchDialogStore(inline);
  }

  const toggle = useCallback(() => {
    storeRef.current?.getState().toggle();
  }, []);
  const hotkey = HOTKEYS["toggle-search"];

  useHotkey(
    useResolvedHotkeyBinding(hotkey),
    toggle,
    createHotkeyOptions(hotkey, t)
  );

  return (
    <SearchOrganizationContext.Provider value={organizationId ?? null}>
      <SearchDialogContext.Provider value={storeRef.current}>
        {!!indexingReady && <SearchIndexCoordinator />}
        {children}
      </SearchDialogContext.Provider>
    </SearchOrganizationContext.Provider>
  );
}

export function useSearchDialogStore<T>(
  selector: (state: SearchDialogStore) => T
): T {
  const store = useContext(SearchDialogContext);
  if (!store) {
    throw new Error(
      "useSearchDialogStore must be used within a SearchProvider"
    );
  }
  return useStore(store, selector);
}

export function useSearchDialog() {
  const store = useContext(SearchDialogContext);
  if (!store) {
    throw new Error("useSearchDialog must be used within a SearchProvider");
  }
  return useStore(store);
}
