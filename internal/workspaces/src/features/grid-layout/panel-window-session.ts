import { z } from "zod";
import {
  decodePanelWindowDescriptor,
  encodePanelWindowDescriptor,
  type PanelWindowDescriptor,
  panelWindowDescriptorSchema,
} from "./panel-window-descriptor";

export const PANEL_WINDOW_ID_PARAM = "panelWindow";
export const PANEL_WINDOW_DESCRIPTOR_PARAM = "panelDescriptor";
export const PANEL_WINDOW_SOURCE_PARAM = "panelSource";
export const PANEL_WINDOW_TOKEN_PARAM = "panelToken";
export const PANEL_WINDOW_TRANSFER_PARAM = "panelTransfer";

const transferSchema = z.object({
  sourceWindowId: z.string().min(1).optional(),
  token: z.string().min(1),
  transferId: z.string().min(1),
});

const storedSessionSchema = z.object({
  descriptor: panelWindowDescriptorSchema.nullable(),
  transfer: transferSchema.optional(),
  windowId: z.string().min(1),
});

export interface PanelWindowSession {
  descriptor: PanelWindowDescriptor | null;
  transfer?: z.infer<typeof transferSchema>;
  windowId: string;
}

function storageKey(windowId: string) {
  return `lunaris.panelWindow.${windowId}`;
}

function readStoredSession(windowId: string): PanelWindowSession | null {
  try {
    const value = sessionStorage.getItem(storageKey(windowId));
    return value ? storedSessionSchema.parse(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: PanelWindowSession) {
  sessionStorage.setItem(storageKey(session.windowId), JSON.stringify(session));
}

export function readPanelWindowSession(search: string): PanelWindowSession | null {
  const params = new URLSearchParams(search);
  const windowId = params.get(PANEL_WINDOW_ID_PARAM);
  if (!windowId) return null;

  const encodedDescriptor = params.get(PANEL_WINDOW_DESCRIPTOR_PARAM);
  const transferId = params.get(PANEL_WINDOW_TRANSFER_PARAM);
  const token = params.get(PANEL_WINDOW_TOKEN_PARAM);
  if (!encodedDescriptor || !transferId || !token) {
    return readStoredSession(windowId) ?? {
      descriptor: null,
      windowId,
    };
  }

  try {
    const sourceWindowId = params.get(PANEL_WINDOW_SOURCE_PARAM) ?? undefined;
    const session = storedSessionSchema.parse({
      descriptor: decodePanelWindowDescriptor(encodedDescriptor),
      transfer: { sourceWindowId, token, transferId },
      windowId,
    });
    writeStoredSession(session);
    return session;
  } catch {
    return { descriptor: null, windowId };
  }
}

export function persistPanelWindowDescriptor(
  session: PanelWindowSession,
  descriptor: PanelWindowDescriptor | null
) {
  writeStoredSession({ ...session, descriptor });
}

export function completePanelWindowTransfer(session: PanelWindowSession) {
  const completed = { ...session, transfer: undefined };
  writeStoredSession(completed);
  return completed;
}

export function panelWindowSearch(windowId: string) {
  const params = new URLSearchParams();
  params.set(PANEL_WINDOW_ID_PARAM, windowId);
  return `?${params.toString()}`;
}

export function buildPanelWindowPath({
  descriptor,
  path,
  sourceWindowId,
  token,
  transferId,
  windowId,
}: {
  descriptor: PanelWindowDescriptor;
  path: string;
  sourceWindowId: string;
  token: string;
  transferId: string;
  windowId: string;
}) {
  const params = new URLSearchParams();
  params.set(PANEL_WINDOW_ID_PARAM, windowId);
  params.set(PANEL_WINDOW_DESCRIPTOR_PARAM, encodePanelWindowDescriptor(descriptor));
  params.set(PANEL_WINDOW_SOURCE_PARAM, sourceWindowId);
  params.set(PANEL_WINDOW_TOKEN_PARAM, token);
  params.set(PANEL_WINDOW_TRANSFER_PARAM, transferId);
  return `${path}?${params.toString()}`;
}
