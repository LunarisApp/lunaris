import type { DockviewApi } from "dockview";

const FOCUS_MODE_WIDTH_STORAGE_KEY = "lunaris.focusModeWidth";
const FOCUS_MODE_WIDTH_DEFAULT = 720;
export const FOCUS_MODE_WIDTH_MIN = 400;

function getFocusModeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function clampFocusModeWidth(width: number): number {
  return Math.max(FOCUS_MODE_WIDTH_MIN, width);
}

export function loadFocusModeWidth(): number {
  const storage = getFocusModeStorage();
  if (!storage) return FOCUS_MODE_WIDTH_DEFAULT;

  const stored = storage.getItem(FOCUS_MODE_WIDTH_STORAGE_KEY);
  if (!stored) return FOCUS_MODE_WIDTH_DEFAULT;

  const parsed = Number.parseFloat(stored);
  return Number.isFinite(parsed)
    ? clampFocusModeWidth(parsed)
    : FOCUS_MODE_WIDTH_DEFAULT;
}

export function persistFocusModeWidth(width: number) {
  const storage = getFocusModeStorage();
  if (!storage) return;
  storage.setItem(FOCUS_MODE_WIDTH_STORAGE_KEY, String(width));
}

export function closeActiveDockviewPanel(dockviewApi: DockviewApi | null) {
  dockviewApi?.activePanel?.api.close();
}

export function toggleDockviewFocusMode(
  dockviewApi: DockviewApi | null,
  isFocusMode: boolean
): boolean | null {
  if (!dockviewApi) return null;

  if (isFocusMode) {
    dockviewApi.activePanel?.api.exitMaximized();
    return false;
  }

  const activePanel = dockviewApi.activePanel;
  if (!activePanel) return null;

  activePanel.api.maximize();
  return true;
}

export function exitDockviewFocusMode(
  dockviewApi: DockviewApi | null,
  isFocusMode: boolean
): boolean | null {
  if (!isFocusMode || !dockviewApi) return null;
  dockviewApi.activePanel?.api.exitMaximized();
  return false;
}
