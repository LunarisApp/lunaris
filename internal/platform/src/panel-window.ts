import type { PlatformKind } from "./platform";

export type PanelWindowPlatform = PlatformKind;

export interface PanelWindowOpenRequest {
  path: string;
  title: string;
  token: string;
  transferId: string;
  windowId: string;
}

export interface PanelWindowHandle {
  close: () => void;
  ready: Promise<void>;
}

export interface PanelWindowAcknowledgement {
  sourceWindowId?: string;
  token: string;
  transferId: string;
}

export interface PanelWindowManager {
  acknowledge: (acknowledgement: PanelWindowAcknowledgement) => Promise<void>;
  currentWindowId: string;
  open: (request: PanelWindowOpenRequest) => PanelWindowHandle;
  platform: PanelWindowPlatform;
}

export type PanelWindowFailureReason =
  | "invalid_descriptor"
  | "manager_unavailable"
  | "open_failed"
  | "popup_blocked"
  | "timeout";

export class PanelWindowError extends Error {
  readonly reason: PanelWindowFailureReason;

  constructor(reason: PanelWindowFailureReason, message: string) {
    super(message);
    this.name = "PanelWindowError";
    this.reason = reason;
  }
}
