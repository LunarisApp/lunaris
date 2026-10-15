import { createHash, randomBytes } from "node:crypto";
import {
  Injectable,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from "@nestjs/common";
import { RedisConfig } from "@app/redis";
import Redis from "ioredis";
import type { AwarenessEntry, PresenceUser } from "./awareness-codec";

export interface PresenceTicket {
  channel?: string;
  documentId: string;
  extensionId?: string;
  kind?: "resource" | "channel" | "yjs";
  organizationId: string;
  resourceId: string;
  sessionId: string;
  storageId: string;
  user: PresenceUser;
  workspaceId: string;
}

// Atomic expiry, ownership, clock ordering, snapshot update and publication.
const UPDATE = `
local now = redis.call('TIME')
local ms = now[1] * 1000 + math.floor(now[2] / 1000)
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ms)
for _, id in ipairs(expired) do redis.call('HDEL', KEYS[1], id) end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ms)
local previous = redis.call('HGET', KEYS[1], ARGV[1])
if previous then
  local p = cjson.decode(previous)
  if p.owner ~= ARGV[2] and p.entry.state ~= cjson.null then return -1 end
  if p.entry.clock >= tonumber(ARGV[3]) then return 0 end
elseif redis.call('HLEN', KEYS[1]) >= 200 then return -1 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[4])
redis.call('ZADD', KEYS[2], ms + 30000, ARGV[1])
redis.call('EXPIRE', KEYS[1], 45)
redis.call('EXPIRE', KEYS[2], 45)
redis.call('PUBLISH', KEYS[3], ARGV[5])
return 1
`;
const SNAPSHOT = `
local now = redis.call('TIME')
local ms = now[1] * 1000 + math.floor(now[2] / 1000)
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ms)
for _, id in ipairs(expired) do redis.call('HDEL', KEYS[1], id) end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ms)
return redis.call('HVALS', KEYS[1])
`;

@Injectable()
export class PresenceRelay implements OnModuleDestroy {
  private command?: Redis;
  private connecting?: Promise<void>;
  private readonly subscriptions = new Set<Redis>();
  constructor(private readonly config: RedisConfig) {}

  private client(): Redis {
    const options = this.config.values;
    if (!options) throw new ServiceUnavailableException("Presence unavailable");
    if (!this.command) {
      this.command = new Redis({
        ...options,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        commandTimeout: 3000,
        connectTimeout: 3000,
        enableOfflineQueue: false,
      });
      this.command.on("error", () => {});
    }
    return this.command;
  }

  private async connected(): Promise<Redis> {
    const client = this.client();
    if (client.status === "wait")
      this.connecting = client.connect().finally(() => {
        this.connecting = undefined;
      });
    if (this.connecting) await this.connecting;
    if (client.status !== "ready")
      throw new ServiceUnavailableException("Presence unavailable");
    return client;
  }

  room(ticket: PresenceTicket): string {
    const hash = createHash("sha256")
      .update(
        JSON.stringify([
          ticket.organizationId,
          ticket.workspaceId,
          ...(ticket.kind === "resource" || ticket.kind === "channel"
            ? [ticket.kind, ticket.resourceId, ticket.extensionId, ticket.channel]
            : [ticket.documentId]),
        ]),
      )
      .digest("hex");
    return `presence:{${hash}}`;
  }

  async issue(ticket: PresenceTicket): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await (await this.connected()).set(
      `presence:ticket:${token}`,
      JSON.stringify(ticket),
      "EX",
      30,
    );
    return token;
  }

  async consume(token: string): Promise<PresenceTicket | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const value = await (await this.connected()).getdel(
      `presence:ticket:${token}`,
    );
    return value ? (JSON.parse(value) as PresenceTicket) : null;
  }

  async subscribe(
    room: string,
    receive: (entry: AwarenessEntry) => void,
    failed: () => void,
  ): Promise<() => void> {
    const subscriber = (await this.connected()).duplicate({
      lazyConnect: true,
    });
    this.subscriptions.add(subscriber);
    subscriber.on("error", failed);
    subscriber.on("close", failed);
    subscriber.on("message", (_channel, payload) => {
      try {
        receive(JSON.parse(payload) as AwarenessEntry);
      } catch {
        failed();
      }
    });
    try {
      await subscriber.connect();
      await subscriber.subscribe(`${room}:events`);
    } catch (error) {
      subscriber.disconnect();
      this.subscriptions.delete(subscriber);
      throw error;
    }
    return () => {
      subscriber.removeAllListeners();
      subscriber.disconnect();
      this.subscriptions.delete(subscriber);
    };
  }

  async snapshot(room: string): Promise<AwarenessEntry[]> {
    const values = (await (
      await this.connected()
    ).eval(SNAPSHOT, 2, `${room}:states`, `${room}:expiry`)) as string[];
    return values.map(
      (value) => (JSON.parse(value) as { entry: AwarenessEntry }).entry,
    );
  }

  async update(
    room: string,
    owner: string,
    entry: AwarenessEntry,
  ): Promise<void> {
    const result = await (await this.connected()).eval(
      UPDATE,
      3,
      `${room}:states`,
      `${room}:expiry`,
      `${room}:events`,
      String(entry.clientId),
      owner,
      String(entry.clock),
      JSON.stringify({ owner, entry }),
      JSON.stringify(entry),
    );
    if (result === -1) throw new Error("Presence client unavailable");
  }

  onModuleDestroy() {
    for (const subscriber of this.subscriptions) subscriber.disconnect();
    this.subscriptions.clear();
    this.command?.disconnect();
  }
}
