import type { AgentWorkManager } from "./agent-work";
import type { AgentAccessManager } from "./agent-access";
import type { PanelWindowManager } from "./panel-window";

export type PlatformKind = "desktop" | "web";

export type OperatingSystem = "linux" | "mac" | "unknown" | "windows";

export interface PlatformClipboard {
  writeText(text: string): Promise<void>;
}

export interface PlatformDownloads {
  downloadUrl(url: string, filename: string): void;
}

export interface PlatformNavigation {
  assign(url: string): void;
  currentUrl(): string;
  open(url: string): void;
  origin(): string;
  reload(): void;
}

export interface PlatformNetwork {
  isOnline(): boolean;
  subscribe(listener: () => void): () => void;
  subscribeOnline(listener: () => void): () => void;
}

export interface PluginArtifactStore {
  delete(key: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, value: Uint8Array): Promise<void>;
}

export interface PlatformPlugins {
  artifacts: PluginArtifactStore;
  fetch: typeof globalThis.fetch;
}

export interface PlatformViewport {
  width(): number;
}

export interface Platform {
  agentAccess?: AgentAccessManager;
  agentWork?: AgentWorkManager;
  clipboard: PlatformClipboard;
  downloads: PlatformDownloads;
  kind: PlatformKind;
  navigation: PlatformNavigation;
  network: PlatformNetwork;
  operatingSystem(): OperatingSystem | undefined;
  panelWindows?: PanelWindowManager;
  plugins: PlatformPlugins;
  viewport: PlatformViewport;
}
