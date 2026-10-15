# 0002: Build Lunaris offline-first

- Status: Accepted
- Date: 2026-10-14

## Context

Writing and navigating should feel immediate. Waiting for a server on every
interaction makes the application depend on network speed, even when connected.

Internet access is widespread, but reliable connections are not universal.
People work at sea, in rural areas, while travelling, and in regions with limited
infrastructure, including parts of developing countries. Congestion and outages
also interrupt work in well-connected places.

Some users also want to keep their writing on their own device without storing
it in the cloud.

## Decision

Read available content and save edits locally. Sync in the background when a
connection is available. Faster everyday interactions are the main goal; working
through poor connections and outages is a core capability.

Synced workspaces exchange local and remote changes after reconnecting. Lunaris
uses PowerSync and SQLite for data persistence and sync, and Yjs for collaborative
rich-text editing.

Offer **Local workspaces** whose content stays on the device and never syncs,
whether online or offline. This privacy choice applies to the whole workspace.

### Limits

- The application and required content must already be on the device. Open cloud
  workspaces and needed uploaded files online before relying on them offline.
- Server features, such as invitations and billing, still need a connection.
- Local saves and completed cloud sync are different states. Show both clearly.
- Local-only storage does not itself provide encryption, protection from someone
  with device access, or backups. Users need exports or other backups before
  clearing local data or replacing a device.

## Alternatives considered

- **Save to the server first:** simplifies centralized state, but makes everyday
  work depend on network latency and availability.
- **Cache reads only:** helps viewing, but does not preserve offline edits or
  reconcile them after reconnecting.
- **Local-only application:** supports fast, private work but lacks optional
  cross-device sync and collaboration.

## Consequences

Users can keep working with downloaded content through connection problems and
choose whether to use cloud storage. Local and synced workspaces share the same
persistence foundation.

Sync adds complexity: concurrent edits, retries, reconnection, and local schema
migrations need care. Devices need space for downloaded content, and unsynced
changes may exist on only one device. Tests must cover offline edits, interrupted
sync, and concurrent changes.

## References

- [Data layer](../../internal/data/README.md)
- [Work offline](../../apps/docs/content/guides/offline-and-sync/work-offline.mdx)
- [Workspace visibility](../../apps/docs/content/reference/workspace-visibility.mdx)
- [Platform availability](../../apps/docs/content/reference/platform-availability.mdx)
