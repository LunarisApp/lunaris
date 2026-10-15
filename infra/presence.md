# Rich-text presence

Presence is ephemeral. PowerSync remains the only content transport; awareness
never writes Yjs storage or version history. Bundled web and desktop resource
views acquire presence only while their pane and browser page are visible.
Read-only viewers participate. Local workspaces and hosts without the optional
SDK capability do not connect.

## Deployment

- Provide `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD` to every API replica.
  Use the same Redis instance and database for every replica. Redis 6.2+ is
  required (`GETDEL`); local Compose uses Redis 7. Existing Redis configuration
  is reused. Keep Redis private to the API network.
- Route `/v1/presence` WebSocket upgrades to the API, with HTTP/1.1 Upgrade and
  Connection headers. Preserve Origin. Allow connections longer than 30 seconds.
  Sticky sessions are unnecessary. Railway's HTTP proxy supports upgrades;
  all replicas still need shared Redis variables.
- Configure `FRONTEND_URL` and `DESKTOP_APP_ORIGINS` as for HTTP CORS. The
  WebSocket handshake enforces these origins too.
- The hosted web CSP derives `ws:` / `wss:` origins from its configured API URLs.
  Custom web/proxy CSPs must include the exact presence API WebSocket origin in
  `connect-src`. The all-in-one proxy forwards upgrades on `/v1/`.
- Restart the API after Redis configuration changes. Redis failure disables
  presence; editing and PowerSync content synchronization continue independently.

`bun run services:up` starts local Redis with the committed development defaults.
Run `PRESENCE_REDIS_TESTS=1 bun test --cwd apps/api src/presence` against that
instance for real Redis and two-gateway integration coverage.

## Protocol and limits

Authenticated `POST /v1/workspaces/:workspaceId/storage/:storageId/presence/ticket`
returns a 30-second, single-use ticket. The client sends it in the first WebSocket
message with its Yjs client ID. Never place tickets in URLs or logs. Binary frames
use standard Yjs awareness encoding. The API supplies identity from the active
session, accepts only the connection's client ID, and rechecks access every
15 seconds. Revocation therefore closes existing connections within that interval.

Redis stores room snapshots and broadcasts changes. Rooms include organization,
workspace, and resolved backing Yjs ID. Entries expire after 30 seconds; clients
also remove stale peers using the standard awareness timeout. Clean disconnects
publish removal immediately. Idle sockets close after roughly 30–45 seconds.
Limits: 8 KiB/frame, 30 frames/second, 32 queued frames, 200 retained room entries,
and 1,000 sockets per API replica. Each socket uses a Redis pub/sub connection;
size Redis connection limits accordingly.

Connection rejection logs include aggregate connection counts only. Do not log
raw frames, tickets, participant identities, or cursor positions.

## Shared resource presence

`POST /v1/workspaces/:workspaceId/resources/:resourceId/presence/ticket`
issues resource membership tickets without requiring Yjs storage. An optional
`{ extensionId, channel }` body requests an enabled extension's ephemeral channel.
The legacy storage ticket route remains supported for Yjs cursors and older clients.
Both use the same authenticated WebSocket endpoint and Redis lifecycle.

Deploy API support before the updated web/desktop hosts and SDK. No database
migration or sync-rule update is required. Existing WebSocket proxy/CSP rules
continue to apply. Membership, channel, and Yjs rooms are isolated; channel
failures do not interrupt header membership or content sync. The sandbox host
binds extension namespaces and storage handles to the active renderer; plugins
cannot supply another resource or extension identity through its bridge.

Generic state is bounded to 4 KiB and depth 8. Each resource view allows at most
16 interaction subscriptions. Membership remains automatic without extension
opt-in. Connection rejection logs contain aggregate counts only, never cursor
payloads or personal data. See the SDK presence guide for lifecycle and examples.
