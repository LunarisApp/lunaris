# Plugin API 0.10 / SDK 0.11

The new SDK emits sandbox protocol 7 and a `dist/runtime.json` build descriptor.
Hosts accept both protocol 6 and 7; existing API-0.9 extensions continue to work.
Extensions using the new capabilities should require `api: "^0.10.0"` and SDK
`^0.11.0`. Release the host before publishing those extensions.

## Incremental Yjs replicas

Protocol-7 snapshots carry storage identity, availability, revision, document epoch,
and persistence status. The replica requests `yjs.sync(storageId, stateVector,
cursor?)` on initial hydration and new revisions. The host checks manifest permissions
and the active resource's storage scope. Initial hydration returns an update, the
host state vector, and a cursor. Later requests return only merged `updateV2` events
since that cursor, avoiding retransmission of historical deletions on every edit.

Each mounted host document retains at most 256 events / 4 MiB. An expired cursor or
changed document epoch falls back to the state-vector handshake. Failed requests
also reset the replica cursor for recovery. Older protocol-7 clients omit the cursor
and keep receiving full handshakes; newer clients accept older hosts' responses.
Requests are coalesced while a handshake is in flight; stale responses after unmount
are ignored.

The replica applies host updates with origin `host`. Normal local updates continue
to use `yjs.applyUpdate`, with each successful send acknowledging its exact event.
Unacknowledged events (including deletion-only edits) are retried without treating a
later successful send as acknowledgement of an earlier failed edit. Host-origin
updates are not echoed by the document listener. Organization write permissions remain host-enforced.
Persistence state and `waitForPersistence()` still refer to host persistence, not
network acknowledgment. Protocol-6 renderers retain their full-snapshot path.

## Chunked downloads

```ts
const downloads = useDownloads();
await downloads.saveChunks?.({
  suggestedName: "data.csv",
  mimeType: "text/csv",
  signal: abortController.signal,
  chunks: byteChunks(), // AsyncIterable<Uint8Array>
});
```

The sandbox splits caller chunks into at most 1 MiB RPC messages. The host validates
metadata, allows one pending download per surface, enforces a 256 MiB total, and
expires inactive sessions after 30 seconds. Tiny writes are coalesced into bounded
buffers. Abort/unmount clears pending buffers. The host still assembles a Blob for
the browser download; this API is not a constant-memory filesystem stream.

The existing `save({ data: ArrayBuffer, ... })` API and its 64 MiB limit are unchanged.
`saveChunks` is optional in the runtime type so hosts without the capability can be
detected explicitly. It uses the existing `downloads.write` permission.

## Artifact metadata

The SDK's validated build writes the protocol used by its executable to
`runtime.json`. The extension registry consumes this metadata when producing the
immutable `release.json`. Legacy builds without metadata retain protocol 6. The
10 MiB executable gate includes inline workers and bundled license notices.
