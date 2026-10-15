import { afterEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { HttpAdapterHost } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { RedisConfig } from "@app/redis";
import type { AppConfig } from "../app.config";
import Redis from "ioredis";
import { WebSocket } from "ws";
import { Doc } from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";
import { PresenceRelay, type PresenceTicket } from "./presence-relay";
import { PresenceGateway } from "./presence.gateway";
import type { PresenceAccessService } from "./presence-access.service";

const integration =
  process.env.PRESENCE_REDIS_TESTS === "1" ? describe : describe.skip;
const config = new RedisConfig(
  new ConfigService({
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: 6379,
    REDIS_PASSWORD: "lunaris-local",
  }),
);
const disposals: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of disposals.splice(0).reverse()) await dispose();
});
function ticket(documentId = randomUUID()): PresenceTicket {
  return {
    organizationId: randomUUID(),
    workspaceId: randomUUID(),
    storageId: randomUUID(),
    resourceId: randomUUID(),
    documentId,
    sessionId: randomUUID(),
    user: { id: randomUUID(), name: "Ada", image: "", color: "#1d4ed8" },
  };
}
function relay() {
  const value = new PresenceRelay(config);
  disposals.push(() => value.onModuleDestroy());
  return value;
}
async function until(predicate: () => boolean, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Presence test timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function gateway(
  relay: PresenceRelay,
  identity: PresenceTicket,
  allowed = () => true,
) {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const access = {
    authorize: async () => {
      if (!allowed()) throw new Error("Revoked");
      return identity;
    },
  } as unknown as PresenceAccessService;
  const gateway = new PresenceGateway(
    { httpAdapter: { getHttpServer: () => server } } as HttpAdapterHost,
    {
      frontendUrl: "http://localhost:5173",
      desktopAppOrigins: [],
      nodeEnv: "test",
    } as unknown as AppConfig,
    relay,
    access,
  );
  gateway.onApplicationBootstrap();
  disposals.push(async () => {
    gateway.onModuleDestroy();
    server.closeAllConnections();
    server.close();
  });
  return server;
}
async function connect(
  server: Server,
  relay: PresenceRelay,
  identity: PresenceTicket,
  token?: string,
) {
  const doc = new Doc();
  const awareness = new Awareness(doc);
  awareness.setLocalState(null);
  const socket = new WebSocket(
    `ws://127.0.0.1:${(server.address() as AddressInfo).port}/v1/presence`,
    { headers: { Origin: "http://localhost:5173" } },
  );
  let ready = false;
  socket.on("message", (data, binary) => {
    if (binary)
      applyAwarenessUpdate(awareness, new Uint8Array(data as Buffer), "remote");
    else if (JSON.parse(data.toString()).type === "ready") ready = true;
  });
  disposals.push(() => {
    socket.terminate();
    awareness.destroy();
    doc.destroy();
  });
  await until(() => socket.readyState === WebSocket.OPEN);
  socket.send(
    JSON.stringify({
      ticket: token ?? (await relay.issue(identity)),
      clientId: doc.clientID,
    }),
  );
  const publish = () => {
    awareness.setLocalState({ user: { id: "forged", name: "Wrong" } });
    socket.send(encodeAwarenessUpdate(awareness, [doc.clientID]));
  };
  return { socket, doc, awareness, publish, ready: () => ready };
}

integration("presence with real Redis and two API replicas", () => {
  it("atomically consumes tickets, isolates rooms, rejects ownership and discards stale clocks", async () => {
    const first = relay();
    const second = relay();
    const identity = ticket();
    const token = await first.issue(identity);
    const consumed = await Promise.all([
      first.consume(token),
      second.consume(token),
    ]);
    expect(consumed.filter(Boolean)).toHaveLength(1);
    const membership = { ...identity, kind: "resource" as const };
    expect(first.room(membership)).toBe(
      first.room({ ...membership, documentId: "different-storage" }),
    );
    expect(first.room(membership)).not.toBe(
      first.room({ ...membership, resourceId: "different-resource" }),
    );
    const channel = {
      ...membership,
      kind: "channel" as const,
      extensionId: "one",
      channel: "pointer",
    };
    expect(first.room(channel)).not.toBe(
      first.room({ ...channel, extensionId: "two" }),
    );
    expect(first.room(channel)).not.toBe(
      first.room({ ...channel, channel: "selection" }),
    );
    const room = first.room(identity);
    expect(room).not.toBe(first.room({ ...identity, organizationId: "other" }));
    await first.update(room, "owner", {
      clientId: 10,
      clock: 1,
      state: { user: identity.user },
    });
    await second.update(room, "owner", { clientId: 10, clock: 0, state: null });
    expect((await second.snapshot(room))[0]?.state?.user.id).toBe(
      identity.user.id,
    );
    await expect(
      second.update(room, "other-owner", {
        clientId: 10,
        clock: 2,
        state: null,
      }),
    ).rejects.toThrow();
    const redis = new Redis(config.values!);
    disposals.push(() => redis.disconnect());
    const expiredToken = await first.issue(identity);
    await redis.expire(`presence:ticket:${expiredToken}`, 0);
    expect(await second.consume(expiredToken)).toBeNull();
    // Expired crashed-session entries cannot survive an initial snapshot.
    await redis.zadd(`${room}:expiry`, 0, "10");
    expect(await second.snapshot(room)).toHaveLength(0);
    await redis.del(`${room}:states`, `${room}:expiry`);
  });

  it("relays initial snapshots and departures across replicas with authenticated identity", async () => {
    const first = relay();
    const second = relay();
    const identity = ticket();
    const a = await gateway(first, identity);
    const b = await gateway(second, identity);
    const writer = await connect(a, first, identity);
    await until(writer.ready);
    writer.publish();
    await until(() => writer.awareness.getStates().has(writer.doc.clientID));
    const reader = await connect(b, second, identity);
    await until(reader.ready);
    await until(() => reader.awareness.getStates().has(writer.doc.clientID));
    expect(reader.awareness.getStates().get(writer.doc.clientID)?.user).toEqual(
      identity.user,
    );
    writer.socket.close();
    await until(() => !reader.awareness.getStates().has(writer.doc.clientID));
  });

  for (const kind of ["resource", "channel"] as const) {
    it(`relays ${kind} snapshots, null state, and departures across replicas`, async () => {
      const first = relay();
      const second = relay();
      const identity = {
        ...ticket(),
        kind,
        extensionId: "example.board",
        channel: "selection",
      };
      const a = await gateway(first, identity);
      const b = await gateway(second, identity);
      const writer = await connect(a, first, identity);
      await until(writer.ready);
      writer.awareness.setLocalState({
        user: { id: "forged" },
        data: { selected: "card" },
      });
      writer.socket.send(
        encodeAwarenessUpdate(writer.awareness, [writer.doc.clientID]),
      );
      const reader = await connect(b, second, identity);
      await until(reader.ready);
      await until(() => reader.awareness.getStates().has(writer.doc.clientID));
      const state = reader.awareness.getStates().get(writer.doc.clientID);
      expect(state?.user).toEqual(identity.user);
      expect(state?.data).toEqual(
        kind === "channel" ? { selected: "card" } : undefined,
      );
      if (kind === "channel") {
        writer.awareness.setLocalStateField("data", null);
        writer.socket.send(
          encodeAwarenessUpdate(writer.awareness, [writer.doc.clientID]),
        );
        await until(
          () =>
            reader.awareness.getStates().get(writer.doc.clientID)?.data ===
            null,
        );
        expect(
          reader.awareness.getStates().get(writer.doc.clientID)?.user,
        ).toEqual(identity.user);
      }
      writer.socket.close();
      await until(() => !reader.awareness.getStates().has(writer.doc.clientID));
    });
  }

  it("rejects replay and clears a revoked connection", async () => {
    const first = relay();
    const identity = ticket();
    let allowed = true;
    const server = await gateway(first, identity, () => allowed);
    const token = await first.issue(identity);
    const client = await connect(server, first, identity, token);
    await until(client.ready);
    client.publish();
    const replay = await connect(server, first, identity, token);
    await until(() => replay.socket.readyState === WebSocket.CLOSED);
    expect(replay.ready()).toBe(false);
    allowed = false;
    await until(() => client.socket.readyState === WebSocket.CLOSED, 17000);
  }, 20000);

  it("closes upgrades outside the presence endpoint", async () => {
    const first = relay();
    const server = await gateway(first, ticket());
    const socket = new WebSocket(
      `ws://127.0.0.1:${(server.address() as AddressInfo).port}/unknown`,
      {
        headers: { Origin: "http://localhost:5173" },
      },
    );
    socket.on("error", () => {});
    disposals.push(() => socket.terminate());
    await until(() => socket.readyState === WebSocket.CLOSED);
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });

  it("closes peers on Redis subscription failure", async () => {
    const first = relay();
    const identity = ticket();
    const server = await gateway(first, identity);
    const client = await connect(server, first, identity);
    await until(client.ready);
    first.onModuleDestroy();
    await until(() => client.socket.readyState === WebSocket.CLOSED);
  });
});
