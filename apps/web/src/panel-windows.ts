import {
  type PanelWindowAcknowledgement,
  PanelWindowError,
  type PanelWindowManager,
  type PanelWindowOpenRequest,
} from "@repo/platform";

const READY_MESSAGE = "lunaris:panel-window-ready";

interface PendingWindow {
  child: Window;
  resolve: () => void;
  token: string;
}

const pending = new Map<string, PendingWindow>();

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.origin !== window.location.origin) {
    return;
  }
  if (!event.data || typeof event.data !== "object") {
    return;
  }
  const data = event.data as Record<string, unknown>;
  if (
    data.type !== READY_MESSAGE ||
    typeof data.transferId !== "string" ||
    typeof data.token !== "string"
  ) {
    return;
  }

  const entry = pending.get(data.transferId);
  if (!entry || event.source !== entry.child || data.token !== entry.token) {
    return;
  }
  pending.delete(data.transferId);
  entry.resolve();
});

function currentWindowId() {
  const fromUrl = new URLSearchParams(window.location.search).get(
    "panelWindow"
  );
  return fromUrl ?? `web-${crypto.randomUUID()}`;
}

function open(request: PanelWindowOpenRequest) {
  let resolveReady: () => void = () => undefined;
  let rejectReady: (error: Error) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const child = window.open(
    request.path,
    request.windowId,
    "popup,width=1280,height=800,resizable=yes"
  );

  if (!child) {
    rejectReady(
      new PanelWindowError("popup_blocked", "Browser blocked panel window")
    );
    return { close: () => undefined, ready };
  }

  pending.set(request.transferId, {
    child,
    resolve: resolveReady,
    token: request.token,
  });

  return {
    close: () => {
      pending.delete(request.transferId);
      child.close();
    },
    ready,
  };
}

async function acknowledge(acknowledgement: PanelWindowAcknowledgement) {
  if (!window.opener) {
    throw new PanelWindowError(
      "open_failed",
      "Panel window opener is unavailable"
    );
  }
  window.opener.postMessage(
    {
      token: acknowledgement.token,
      transferId: acknowledgement.transferId,
      type: READY_MESSAGE,
    },
    window.location.origin
  );
}

export const webPanelWindows: PanelWindowManager = {
  acknowledge,
  currentWindowId: currentWindowId(),
  open,
  platform: "web",
};
