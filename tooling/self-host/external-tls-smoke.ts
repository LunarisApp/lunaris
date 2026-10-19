// Runs inside the isolated API test container, through a separate TLS proxy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const origin = "https://notes.lunaris.test";
const tls = { ca: readFileSync("/tmp/proxy.crt") };
let cookie = "";
async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Origin", origin);
  headers.set("Cookie", cookie);
  const response = await fetch(new URL(path, origin), {
    ...options,
    tls,
    signal: AbortSignal.timeout(15_000),
    headers,
  });
  assert(
    response.ok || (options.redirect === "manual" && response.status === 302),
    `${new URL(path, origin).pathname}: HTTP ${response.status}`
  );
  return response;
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await request(
    path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
  );
  return response.json() as Promise<T>;
}

// Let the test proxy finish opening its listener after Compose starts it.
for (let attempt = 0; ; attempt++) {
  try {
    await request("/v1/health");
    break;
  } catch (error) {
    if (attempt === 20) {
      throw error;
    }
    await Bun.sleep(250);
  }
}
if (process.env.SELF_HOST_NO_WEB) {
  for (const path of ["/", "/auth"]) {
    const response = await fetch(new URL(path, origin), { tls });
    assert.equal(response.status, 404);
    assert(!response.headers.get("Content-Type")?.includes("text/html"));
  }
} else {
  assert(
    (await request("/auth")).headers.get("Content-Type")?.includes("text/html")
  );
}
const directory = await api<{ servers: { manifestUrl: string }[] }>(
  "/.well-known/lunaris-servers"
);
assert.equal(directory.servers[0]?.manifestUrl, `${origin}/v1/manifest`);

const email = `proxy-${crypto.randomUUID()}@example.com`;
const password = "Proxy-smoke-password-1234";
await api("/auth/sign-up/email", { name: "Proxy smoke", email, password });
const login = await request("/auth/sign-in/email", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const cookies = login.headers.getSetCookie();
assert(
  cookies.some((value) => /session_token=.*;.*Secure/i.test(value)),
  "HTTPS session cookie must be Secure"
);
cookie = cookies.map((value) => value.split(";")[0]).join("; ");
const session = await api<{ user: { id: string; email: string } }>(
  "/auth/get-session"
);
assert.equal(session.user.email, email);

const workspace = await api<{ id: string }>("/v1/workspaces", {
  name: "Proxy smoke",
  slug: "proxy-smoke",
});
const resource = await api<{ id: string }>(
  `/v1/workspaces/${workspace.id}/resources`,
  {
    name: "Proxy resource",
    resourceTypeId: "lunaris.folder",
    storage: {},
  }
);

// Use real avatar signing endpoints to exercise S3 Host/path preservation.
const upload = await api<{ uploadUrl: string; key: string }>(
  "/v1/account/avatar/upload-url",
  { resource: "image/png" }
);
assert.equal(new URL(upload.uploadUrl).origin, origin);
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=",
  "base64"
);
await request(upload.uploadUrl, {
  method: "PUT",
  headers: { "Content-Type": "image/png" },
  body: image,
});
await api("/v1/account/avatar/confirm", { key: upload.key });
const download = await request(`/v1/account/avatar/${session.user.id}`, {
  redirect: "manual",
});
assert.equal(download.status, 302);
const signed = download.headers.get("Location");
assert(signed && new URL(signed).origin === origin);
assert(Buffer.from(await (await request(signed)).arrayBuffer()).equals(image));

const credentials = await api<{ token: string; powersyncUrl: string }>(
  "/v1/sync/credentials"
);
assert.equal(credentials.powersyncUrl, `${origin}/sync`);
const stream = await request("/sync/sync/stream", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/x-ndjson",
    Authorization: `Token ${credentials.token}`,
  },
  body: JSON.stringify({ buckets: [], include_checksum: true, raw_data: true }),
});
const reader = stream.body?.getReader();
assert(reader);
try {
  const chunk = await reader.read();
  assert(
    !chunk.done && chunk.value.byteLength > 0,
    "Sync stream must deliver data before closing"
  );
} finally {
  await reader.cancel();
}

const ticket = await api<{ ticket: string }>(
  `/v1/workspaces/${workspace.id}/resources/${resource.id}/presence/ticket`,
  {}
);
// Shared tooling also loads DOM types; Bun's client supports TLS and headers.
const Socket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions
) => WebSocket;
const socket = new Socket(`${origin.replace("https:", "wss:")}/v1/presence`, {
  protocols: [],
  tls,
  headers: { Origin: origin },
});
try {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Presence handshake timed out")),
      10_000
    );
    socket.addEventListener("open", () =>
      socket.send(JSON.stringify({ ticket: ticket.ticket, clientId: 7 }))
    );
    socket.addEventListener("message", ({ data }) => {
      if (typeof data === "string" && JSON.parse(data).type === "ready") {
        clearTimeout(timer);
        resolve();
      }
    });
    for (const event of ["error", "close"]) {
      socket.addEventListener(event, () => {
        clearTimeout(timer);
        reject(new Error("Presence handshake failed"));
      });
    }
  });
} finally {
  socket.close();
}
console.log(
  "External TLS login, secure cookies, discovery, signed uploads/downloads, sync streaming, and authenticated WebSockets passed."
);
