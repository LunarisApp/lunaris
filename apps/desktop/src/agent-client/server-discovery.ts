import {
  type ServerManifest,
  serverAuthSchema,
  serverManifestSchema,
} from "@repo/agent-contracts";
import * as z from "zod";
import { type Fetcher, LunarisApiError } from "./cloud-client";

export const DEFAULT_SERVER_DIRECTORY_URL =
  "https://lunaris.app/.well-known/lunaris-servers";

export { serverAuthSchema, serverManifestSchema };

const availableServerSchema = z.object({
  displayName: z.string().min(1),
  manifestUrl: z.string().url(),
  serverId: z.string().min(1),
  status: z.literal("available"),
});

const plannedServerSchema = z.object({
  displayName: z.string().min(1),
  manifestUrl: z.string().url().optional(),
  serverId: z.string().min(1),
  status: z.literal("planned"),
});

export const serverDirectorySchema = z
  .object({
    schemaVersion: z.literal(1),
    servers: z.array(z.discriminatedUnion("status", [
      availableServerSchema,
      plannedServerSchema,
    ])),
  })
  .superRefine((directory, context) => {
    const ids = new Set<string>();
    for (const [index, server] of directory.servers.entries()) {
      if (ids.has(server.serverId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate server ID: ${server.serverId}`,
          path: ["servers", index, "serverId"],
        });
      }
      ids.add(server.serverId);
    }
  });

export type { ServerManifest };
export type ServerDirectory = z.infer<typeof serverDirectorySchema>;
export type Server = ServerDirectory["servers"][number];
export type AvailableServer = Extract<Server, { status: "available" }>;

export interface ServerDiscoveryOptions {
  directoryUrl?: string;
  fetch?: Fetcher;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function discoverRemoteServers(
  options: ServerDiscoveryOptions = {},
): Promise<ServerDirectory> {
  const directoryUrl = options.directoryUrl ?? DEFAULT_SERVER_DIRECTORY_URL;
  const payload = await fetchJson(
    new URL(directoryUrl),
    options,
    "Unable to connect to the Lunaris server directory",
    "SERVER_DISCOVERY_UNAVAILABLE",
  );
  const parsed = serverDirectorySchema.safeParse(payload);
  if (!parsed.success) {
    throw new LunarisApiError(
      "Lunaris server directory returned an invalid response",
      502,
      "INVALID_SERVER_DIRECTORY",
      parsed.error.issues,
    );
  }
  return parsed.data;
}

export async function discoverServerManifest(
  input: AvailableServer | string,
  options: ServerDiscoveryOptions = {},
): Promise<ServerManifest> {
  const manifestUrl =
    typeof input === "string"
      ? new URL("/v1/manifest", normalizeBaseUrl(input))
      : new URL(input.manifestUrl);
  return fetchServerManifest(manifestUrl, options, input);
}

export async function discoverServerManifestUrl(
  manifestUrl: string | URL,
  options: ServerDiscoveryOptions = {},
): Promise<ServerManifest> {
  return fetchServerManifest(new URL(manifestUrl), options);
}

export function mergeServerDirectories(
  remote: ServerDirectory | undefined,
  local: AvailableServer | null,
): ServerDirectory {
  const servers = remote ? [...remote.servers] : [];
  if (local) {
    const index = servers.findIndex(
      (server) => server.serverId === local.serverId,
    );
    if (index >= 0) servers[index] = local;
    else servers.push(local);
  }
  return { schemaVersion: 1, servers };
}

export function isLoopbackUrl(url: URL) {
  return (
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !url.username &&
    !url.password
  );
}

async function fetchServerManifest(
  manifestUrl: URL,
  options: ServerDiscoveryOptions,
  expected?: AvailableServer | string,
) {
  const payload = await fetchJson(
    manifestUrl,
    options,
    "Unable to connect to the Lunaris server manifest",
    "SERVER_MANIFEST_UNAVAILABLE",
  );
  const parsed = serverManifestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new LunarisApiError(
      "Lunaris server returned an invalid manifest",
      502,
      "INVALID_SERVER_MANIFEST",
      parsed.error.issues,
    );
  }
  if (typeof expected === "object" && parsed.data.serverId !== expected.serverId) {
    throw new LunarisApiError(
      `Server manifest mismatch: expected ${expected.serverId}, got ${parsed.data.serverId}`,
      502,
      "SERVER_MANIFEST_MISMATCH",
    );
  }
  return parsed.data;
}

async function fetchJson(
  url: URL,
  options: ServerDiscoveryOptions,
  message: string,
  code: string,
) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (cause) {
    const error = new LunarisApiError(message, 0, code);
    error.cause = cause;
    throw error;
  }
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new LunarisApiError(
      `${message}: ${response.status}`,
      response.status,
      code,
    );
  }
  return payload;
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url;
}
