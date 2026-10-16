// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { Doc } from "yjs";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import {
  useRemotePresenceDocument,
  useRemoteResourceAwareness,
  useRemoteYjsAwareness,
  type AwarenessBridge,
} from "./sandbox-awareness";

const user = { id: "user", name: "User", image: "", color: "#1d4ed8" };
function bridgeSetup() {
  let snapshot: Record<string, unknown> = {};
  const listeners = new Set<() => void>();
  const call = vi.fn().mockResolvedValue(undefined);
  const bridge: AwarenessBridge = {
    call,
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  const publish = (channels: unknown[] = [], active = true) => {
    snapshot = {
      presence: {
        version: 1,
        active,
        membership: { self: user, participants: [], status: "connected" },
        channels,
      },
    };
    for (const fn of listeners) {
      fn();
    }
  };
  return { bridge, call, publish };
}
afterEach(() => vi.restoreAllMocks());
describe("sandbox awareness", () => {
  it("does not subscribe on older hosts; cleans up on hidden views", async () => {
    const { bridge, call, publish } = bridgeSetup();
    const hook = renderHook(() =>
      useRemoteResourceAwareness(bridge, "pointer")
    );
    expect(hook.result.current.status).toBe("unavailable");
    expect(call).not.toHaveBeenCalled();
    await act(async () => publish());
    expect(call).toHaveBeenCalledWith("presence.open", [
      expect.any(String),
      { channel: "pointer" },
    ]);
    const setState = hook.result.current.setState;
    await act(async () => publish([], false));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith("presence.close", [expect.any(String)])
    );
    expect(hook.result.current.setState).toBe(setState);
    hook.unmount();
  });
  it("shares Yjs subscriptions across consumers and StrictMode replay", async () => {
    const { bridge, call, publish } = bridgeSetup();
    publish();
    const first = renderHook(
      () => useRemoteYjsAwareness(bridge, "storage", "workspace"),
      { wrapper: StrictMode }
    );
    const second = renderHook(() =>
      useRemoteYjsAwareness(bridge, "storage", "workspace")
    );
    expect(first.result.current.awareness).toBe(
      second.result.current.awareness
    );
    expect(
      call.mock.calls.filter(([method]) => method === "presence.open")
    ).toHaveLength(1);
    first.unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(
      call.mock.calls.filter(([method]) => method === "presence.close")
    ).toHaveLength(0);
    second.unmount();
    await waitFor(() =>
      expect(
        call.mock.calls.filter(([method]) => method === "presence.close")
      ).toHaveLength(1)
    );
  });
  it("relays one local update across duplicate consumers and isolates disabled consumers", async () => {
    const { bridge, call, publish } = bridgeSetup();
    publish();
    const first = renderHook(() =>
      useRemoteYjsAwareness(bridge, "storage", "workspace")
    );
    const second = renderHook(
      ({ enabled }) =>
        useRemoteYjsAwareness(bridge, "storage", "workspace", { enabled }),
      { initialProps: { enabled: true } }
    );
    const id = call.mock.calls.find(
      ([method]) => method === "presence.open"
    )![1][0];
    await act(async () =>
      publish([{ id, status: "connected", peers: [], user }])
    );
    call.mockClear();
    act(() =>
      first.result.current.awareness!.setLocalStateField("cursor", null)
    );
    expect(
      call.mock.calls.filter(([method]) => method === "presence.update")
    ).toHaveLength(1);
    second.rerender({ enabled: false });
    expect(second.result.current.status).toBe("unavailable");
    expect(first.result.current.awareness!.getLocalState()?.user).toEqual(user);
    call.mockClear();
    act(() =>
      first.result.current.awareness!.setLocalStateField("cursor", {
        anchor: 1,
      })
    );
    expect(
      call.mock.calls.filter(([method]) => method === "presence.update")
    ).toHaveLength(1);
    first.unmount();
    expect(second.result.current.awareness!.getStates().size).toBe(0);
    second.unmount();
  });
  it("replays the latest shared channel state after reconnect", async () => {
    const { bridge, call, publish } = bridgeSetup();
    publish();
    const first = renderHook(() =>
      useRemoteResourceAwareness(bridge, "selection")
    );
    const second = renderHook(() =>
      useRemoteResourceAwareness(bridge, "selection")
    );
    const id = call.mock.calls.find(
      ([method]) => method === "presence.open"
    )![1][0];
    await act(async () => publish([{ id, peers: [], status: "connected" }]));
    act(() => second.result.current.setState({ selected: "old" }));
    act(() => first.result.current.setState(null));
    await act(async () => publish([{ id, peers: [], status: "error" }]));
    call.mockClear();
    await act(async () => publish([{ id, peers: [], status: "connected" }]));
    const updates = call.mock.calls.filter(
      ([method]) => method === "presence.update"
    );
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.every(([, args]) => args[1] === null)).toBe(true);
    first.unmount();
    second.unmount();
  });
  it("retains generic state during setup, and keeps hidden publishers inert", async () => {
    const { bridge, call, publish } = bridgeSetup();
    publish();
    const hook = renderHook(() =>
      useRemoteResourceAwareness(bridge, "selection")
    );
    const id = call.mock.calls.find(
      ([method]) => method === "presence.open"
    )![1][0];
    act(() => hook.result.current.setState({ selected: "card" }));
    expect(
      call.mock.calls.filter(([method]) => method === "presence.update")
    ).toHaveLength(0);
    await act(async () => publish([{ id, peers: [], status: "connected" }]));
    expect(call).toHaveBeenCalledWith("presence.update", [
      id,
      { selected: "card" },
    ]);
    await act(async () => publish([], false));
    call.mockClear();
    act(() => hook.result.current.setState({ selected: "hidden" }));
    expect(
      call.mock.calls.filter(([method]) => method === "presence.update")
    ).toHaveLength(0);
    hook.unmount();
  });
  it("shares the actual storage document and relays remote cursors without content edits", async () => {
    const { bridge, call, publish } = bridgeSetup();
    publish();
    const hook = renderHook(() => {
      const doc = useRemotePresenceDocument(
        bridge,
        JSON.stringify(["workspace", "storage"])
      );
      return { doc, ...useRemoteYjsAwareness(bridge, "storage", "workspace") };
    });
    const contentChanged = vi.fn();
    hook.result.current.doc.on("updateV2", contentChanged);
    const open = call.mock.calls.find((args) => args[0] === "presence.open")!;
    const [id, input] = open[1];
    expect(input.clientId).toBe(hook.result.current.doc.clientID);
    expect(hook.result.current.awareness?.clientID).toBe(input.clientId);
    const peerDoc = new Doc();
    const peer = new Awareness(peerDoc);
    peer.setLocalState({ user: { ...user, id: "peer" }, cursor: null });
    const packet = encodeAwarenessUpdate(peer, [peerDoc.clientID]).buffer;
    await act(async () =>
      publish([{ id, status: "connected", peers: [], user, update: packet }])
    );
    expect(
      hook.result.current.awareness?.getStates().get(peerDoc.clientID)?.user.id
    ).toBe("peer");
    const before = call.mock.calls.filter(
      (args) => args[0] === "presence.update"
    ).length;
    peer.setLocalStateField("cursor", { test: "remote" });
    await act(async () =>
      publish([
        {
          id,
          status: "connected",
          peers: [],
          user,
          update: encodeAwarenessUpdate(peer, [peerDoc.clientID]).buffer,
        },
      ])
    );
    expect(
      call.mock.calls.filter((args) => args[0] === "presence.update")
    ).toHaveLength(before);
    expect(contentChanged).not.toHaveBeenCalled();
    await act(async () =>
      publish([{ id, status: "error", peers: [], update: new ArrayBuffer(0) }])
    );
    expect(hook.result.current.awareness?.getStates().size).toBe(0);
    hook.unmount();
    peer.destroy();
    peerDoc.destroy();
  });
});
