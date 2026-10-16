"use client";

import type { Hotkey } from "@tanstack/react-hotkeys";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react";
import { createStore, useStore } from "zustand";
import { persist } from "zustand/middleware";
import { HOTKEYS, type HotkeyId, isHotkeyId } from "./registry";

const MODIFIER_ONLY = new Set([
  "Mod",
  "Ctrl",
  "Control",
  "Shift",
  "Alt",
  "Option",
  "Meta",
  "Cmd",
]);

/** True when a recorder-captured hotkey string has at least one non-modifier key. */
export function isValidHotkeyBinding(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  const parts = value
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return false;
  }
  return parts.some((p) => !MODIFIER_ONLY.has(p));
}

/**
 * Filter a persisted overrides object to known hotkey ids + valid bindings.
 * Drops orphan entries (ids no longer in HOTKEYS) and malformed values.
 */
function sanitizeOverrides(input: unknown): Partial<Record<HotkeyId, Hotkey>> {
  if (!input || typeof input !== "object") {
    return {};
  }
  const overrides = input as Record<string, unknown>;
  const out: Partial<Record<HotkeyId, Hotkey>> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (!isHotkeyId(key)) {
      continue;
    }
    if (!(key in HOTKEYS)) {
      continue;
    }
    if (!isValidHotkeyBinding(value)) {
      continue;
    }
    out[key] = value as Hotkey;
  }
  return out;
}

export interface HotkeyOverridesState {
  clearOverride: (id: HotkeyId) => void;
  overrides: Partial<Record<HotkeyId, Hotkey>>;
  resetAll: () => void;
  setOverride: (id: HotkeyId, key: Hotkey) => void;
}

export type HotkeyOverridesStore = ReturnType<
  typeof createHotkeyOverridesStore
>;

// Singleton ref for pure-function callers (getHotkeyBinding, formatHotkeyDisplay)
// that cannot reach React context. The persist layer already assumes a single
// tab-wide instance, so tracking one mounted store here is safe.
let storeInstance: HotkeyOverridesStore | null = null;

export function createHotkeyOverridesStore() {
  return createStore<HotkeyOverridesState>()(
    persist(
      (set) => ({
        overrides: {},
        setOverride: (id, key) =>
          set((state) => {
            if (!isValidHotkeyBinding(key)) {
              return state;
            }
            return { overrides: { ...state.overrides, [id]: key } };
          }),
        clearOverride: (id) =>
          set((state) => {
            const next = { ...state.overrides };
            delete next[id];
            return { overrides: next };
          }),
        resetAll: () => set({ overrides: {} }),
      }),
      {
        name: "lunaris.hotkeyOverrides",
        version: 1,
        partialize: (state) => ({ overrides: state.overrides }),
        // Defensive rehydration: drop entries with unknown ids or invalid
        // binding shapes (non-strings, empty, modifier-only, tampered JSON).
        // Also GCs orphan overrides for hotkeys removed from the registry.
        merge: (persisted, current) => {
          const raw = (persisted as { overrides?: unknown } | null)?.overrides;
          return { ...current, overrides: sanitizeOverrides(raw) };
        },
      }
    )
  );
}

const HotkeyOverridesContext = createContext<HotkeyOverridesStore | null>(null);

export function HotkeyOverridesProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<HotkeyOverridesStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createHotkeyOverridesStore();
  }

  useEffect(() => {
    storeInstance = storeRef.current;
    return () => {
      if (storeInstance === storeRef.current) {
        storeInstance = null;
      }
    };
  }, []);

  return (
    <HotkeyOverridesContext.Provider value={storeRef.current}>
      {children}
    </HotkeyOverridesContext.Provider>
  );
}

export function useHotkeyOverrides<T>(
  selector: (state: HotkeyOverridesState) => T
): T {
  const store = useContext(HotkeyOverridesContext);
  if (!store) {
    throw new Error(
      "useHotkeyOverrides must be used within a HotkeyOverridesProvider"
    );
  }
  return useStore(store, selector);
}

/**
 * Non-reactive accessor for pure functions (getHotkeyBinding, formatHotkeyDisplay).
 * Returns `{}` when no provider is mounted (SSR, tests without provider).
 */
export function getHotkeyOverrides(): Partial<Record<HotkeyId, Hotkey>> {
  return storeInstance?.getState().overrides ?? {};
}
