import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { log } from "evlog";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { z } from "zod";
import { AppConfig } from "../app.config";
import { isAllowedOrigin } from "../cors.config";
import {
  encodeAwareness,
  readOwnedAwareness,
  type AwarenessEntry,
} from "./awareness-codec";
import { PresenceAccessService } from "./presence-access.service";
import { PresenceRelay, type PresenceTicket } from "./presence-relay";

const hello = z.object({
  ticket: z.string().regex(/^[a-f0-9]{64}$/),
  clientId: z.number().int().min(0).max(0xff_ff_ff_ff),
});

@Injectable()
export class PresenceGateway
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 8192,
    perMessageDeflate: false,
  });
  private server?: Server;
  constructor(
    private readonly adapter: HttpAdapterHost,
    private readonly config: AppConfig,
    private readonly relay: PresenceRelay,
    private readonly access: PresenceAccessService
  ) {}

  private upgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ) => {
    // This API has no other upgrade routes. An ignored upgrade leaves its raw
    // socket open outside the WebSocket server's limits and authentication timer.
    if (request.url !== "/v1/presence") {
      socket.destroy();
      return;
    }
    if (
      !(
        request.headers.origin &&
        isAllowedOrigin(request.headers.origin, this.config)
      ) ||
      this.sockets.clients.size >= 1000
    ) {
      socket.destroy();
      return;
    }
    this.sockets.handleUpgrade(request, socket, head, (ws) => this.accept(ws));
  };

  onApplicationBootstrap() {
    this.server = this.adapter.httpAdapter.getHttpServer() as Server;
    this.server.on("upgrade", this.upgrade);
  }

  private accept(socket: WebSocket) {
    const owner = randomUUID();
    let ticket: PresenceTicket | null = null;
    let room = "";
    let clientId = -1;
    let latest: AwarenessEntry | undefined;
    let unsubscribe: (() => void) | undefined;
    let lastMessage = Date.now();
    let frames = 0;
    let windowStart = Date.now();
    let pending = 0;
    let closed = false;
    let checking = false;
    const send = (entry: AwarenessEntry) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (socket.bufferedAmount > 256 * 1024) {
        socket.close(1013, "Presence overloaded");
        return;
      }
      socket.send(encodeAwareness([entry]));
    };
    const fail = () => socket.close(1011, "Presence unavailable");
    const authTimer = setTimeout(
      () => socket.close(1008, "Authentication required"),
      5000
    );
    const health = setInterval(() => {
      if (Date.now() - lastMessage > 30_000) {
        socket.terminate();
        return;
      }
      if (!ticket || checking) {
        return;
      }
      checking = true;
      void this.access
        .authorize({ ...ticket, userId: ticket.user.id })
        .then((next) => {
          if (
            next.documentId !== ticket?.documentId ||
            next.resourceId !== ticket?.resourceId
          ) {
            throw new Error("Storage changed");
          }
          ticket = next;
        })
        .catch(() => socket.close(1008, "Presence access expired"))
        .finally(() => {
          checking = false;
        });
    }, 15_000);
    // Serialize messages, including async authentication, without unbounded buffering.
    let queue = Promise.resolve();
    socket.on("message", (data: RawData, binary: boolean) => {
      if (Date.now() - windowStart >= 1000) {
        frames = 0;
        windowStart = Date.now();
      }
      if (++frames > 30 || ++pending > 32) {
        socket.close(1008, "Presence rate exceeded");
        return;
      }
      queue = queue
        .then(async () => {
          if (closed) {
            return;
          }
          if (ticket) {
            if (!binary) {
              throw new Error("Expected awareness update");
            }
            const bytes = Buffer.isBuffer(data)
              ? data
              : data instanceof ArrayBuffer
                ? Buffer.from(data)
                : Buffer.concat(data);
            const entry = readOwnedAwareness(
              bytes,
              clientId,
              ticket.user,
              ticket.kind
            );
            if (latest && entry.clock <= latest.clock) {
              return;
            }
            await this.relay.update(room, owner, entry);
            latest = entry;
          } else {
            if (binary) {
              throw new Error("Expected presence ticket");
            }
            const message = hello.parse(JSON.parse(data.toString()));
            const consumed = await this.relay.consume(message.ticket);
            if (!consumed) {
              throw new Error("Invalid presence ticket");
            }
            ticket = await this.access.authorize({
              ...consumed,
              userId: consumed.user.id,
            });
            if (
              ticket.documentId !== consumed.documentId ||
              ticket.resourceId !== consumed.resourceId
            ) {
              throw new Error("Storage changed");
            }
            clientId = message.clientId;
            room = this.relay.room(ticket);
            unsubscribe = await this.relay.subscribe(room, send, fail);
            if (closed) {
              unsubscribe();
              return;
            }
            const snapshot = await this.relay.snapshot(room);
            for (const entry of snapshot) {
              send(entry);
            }
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: "ready", user: ticket.user }));
            }
            clearTimeout(authTimer);
          }
          lastMessage = Date.now();
        })
        .catch(() => {
          log.warn({
            tag: "Presence",
            msg: "Presence connection closed",
            activeConnections: this.sockets.clients.size,
          });
          socket.close(1008, "Presence connection rejected");
        })
        .finally(() => {
          pending--;
        });
    });
    socket.on("error", () => socket.terminate());
    socket.on("close", () => {
      closed = true;
      clearTimeout(authTimer);
      clearInterval(health);
      unsubscribe?.();
      void queue.finally(async () => {
        unsubscribe?.();
        if (!(latest && room)) {
          return;
        }
        try {
          await this.relay.update(room, owner, {
            clientId,
            clock: latest.clock + 1,
            state: null,
          });
        } catch {
          /* Remote expiry handles relay outages. */
        }
      });
    });
  }

  onModuleDestroy() {
    this.server?.off("upgrade", this.upgrade);
    for (const socket of this.sockets.clients) {
      socket.terminate();
    }
    this.sockets.close();
  }
}
