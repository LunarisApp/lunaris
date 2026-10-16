import {
  type PanelWindowAcknowledgement,
  PanelWindowError,
  type PanelWindowManager,
  type PanelWindowOpenRequest,
} from "@repo/platform";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow";

const READY_EVENT = "lunaris-panel-window-ready";

interface PendingWindow {
  resolve: () => void;
  token: string;
}

const pending = new Map<string, PendingWindow>();

void listen<{ token: string; transferId: string }>(
  READY_EVENT,
  ({ payload }) => {
    const entry = pending.get(payload.transferId);
    if (!entry || payload.token !== entry.token) {
      return;
    }
    pending.delete(payload.transferId);
    entry.resolve();
  }
);

function open(request: PanelWindowOpenRequest) {
  let resolveReady: () => void = () => undefined;
  let rejectReady: (error: Error) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  pending.set(request.transferId, {
    resolve: resolveReady,
    token: request.token,
  });

  const child = new WebviewWindow(request.windowId, {
    height: 800,
    minHeight: 640,
    minWidth: 960,
    resizable: true,
    title: request.title,
    url: request.path,
    width: 1280,
  });
  void child.once("tauri://error", ({ payload }) => {
    pending.delete(request.transferId);
    rejectReady(
      new PanelWindowError(
        "open_failed",
        `Failed to create panel window: ${String(payload)}`
      )
    );
  });

  return {
    close: () => {
      pending.delete(request.transferId);
      void child.destroy();
    },
    ready,
  };
}

async function acknowledge(acknowledgement: PanelWindowAcknowledgement) {
  if (!acknowledgement.sourceWindowId) {
    throw new PanelWindowError(
      "open_failed",
      "Source window label is unavailable"
    );
  }
  await emitTo(acknowledgement.sourceWindowId, READY_EVENT, {
    token: acknowledgement.token,
    transferId: acknowledgement.transferId,
  });
}

export const desktopPanelWindows: PanelWindowManager = {
  acknowledge,
  currentWindowId: getCurrentWebviewWindow().label,
  open,
  platform: "desktop",
};
