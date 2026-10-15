// @vitest-environment happy-dom

import { afterEach, expect, it, vi } from "vitest";
import {
  notifyWorkspaceExtensionsChanged,
  subscribeToWorkspaceExtensionChanges,
} from "./workspace-extension-change-notification";

const originalBroadcastChannel = globalThis.BroadcastChannel;

class FakeBroadcastChannel {
  static channels = new Set<FakeBroadcastChannel>();
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(readonly name: string) {
    FakeBroadcastChannel.channels.add(this);
  }

  close() {
    FakeBroadcastChannel.channels.delete(this);
  }

  postMessage(value: unknown) {
    for (const channel of FakeBroadcastChannel.channels) {
      if (channel === this || channel.name !== this.name) continue;
      channel.onmessage?.(new MessageEvent("message", { data: value }));
    }
  }
}

afterEach(() => {
  FakeBroadcastChannel.channels.clear();
  globalThis.BroadcastChannel = originalBroadcastChannel;
});

it("delivers one typed change per workspace across window and broadcast paths", () => {
  globalThis.BroadcastChannel = FakeBroadcastChannel as never;
  const listener = vi.fn();
  const unsubscribe = subscribeToWorkspaceExtensionChanges("workspace-1", listener);

  notifyWorkspaceExtensionsChanged({
    enabled: true,
    extensionId: "acme.tasks",
    operation: "enable",
    workspaceId: "workspace-1",
    revision: "release-1",
  });
  notifyWorkspaceExtensionsChanged({
    enabled: false,
    extensionId: "acme.other",
    operation: "disable",
    workspaceId: "workspace-2",
  });

  expect(listener).toHaveBeenCalledOnce();
  expect(listener).toHaveBeenCalledWith(
    expect.objectContaining({
      enabled: true,
      extensionId: "acme.tasks",
      operation: "enable",
      workspaceId: "workspace-1",
      revision: "release-1",
    }),
  );
  unsubscribe();
});
