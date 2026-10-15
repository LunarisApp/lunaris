# Resource presence and awareness

The host automatically announces visible cloud resource views and renders viewer avatars beside the resource menu. This includes read-only viewers, file resources, bundled views, and external extensions. No presence manifest flag or membership hook is required.

Only visible resource renderers receive interaction capabilities. Hidden panels and browser tabs release presence; preload, export, status-bar, and history readers do not announce it. Local-only workspaces and older hosts return `unavailable`. A failed connection returns `error` and clears remote state without affecting content editing.

## Read the participants

Requires the existing `content.read` permission. `participants` contains other users, deduplicated across sessions; `self` is the server-derived identity. Names can be empty: display a localized fallback. No email is included.

```tsx
import { useResourcePresence } from "@lunarisapp/plugin-sdk";

function Viewers() {
  const { participants, status } = useResourcePresence();
  if (status !== "connected") return null;
  return <ul>{participants.map(user => <li key={user.id}>{user.name || "Collaborator"}</li>)}</ul>;
}
```

Membership is independent of interaction state. Reading participants does not open another connection.

## Share transient selections or pointers

`useResourceAwareness<T>(channel, { enabled })` exposes `peers`, `status`, and stable `setState`. Channels are isolated by workspace, resource, extension ID, and channel name. A channel contains separate view/session instances, including the current user's other views. The publishing instance is excluded from its own peers.

```tsx
import { useResourceAwareness } from "@lunarisapp/plugin-sdk";

function Cards() {
  const { peers, setState } = useResourceAwareness<{ selected: string[] }>("selection");
  // Call setState({ selected: [cardId] }) from your selection handler.
  // Call setState(null) to clear the selection while keeping resource membership.
  // Validate each peer.state before reading selected: T is not runtime validation.
  return <button onClick={() => setState(null)}>Clear selection</button>;
}
```

Channel names use 1–64 letters, digits, `.`, `_`, or `-`. State must be JSON, at most 4 KiB UTF-8 and depth 8. Up to 16 active interaction subscriptions per resource view are supported. `setState` replaces this instance's state; `null` clears it. State is coalesced for transport, is never persisted, and must not carry credentials or sensitive personal data.

Use resource-relative coordinates or stable entity IDs. Rendering pointers and interpreting selections belongs to the extension. A type parameter describes the expected shape only: validate remote state at runtime. Do not use presence as a lock or evidence of authorization.

## Yjs editor cursors

```tsx
import { useYjsStorage, useYjsAwareness } from "@lunarisapp/plugin-sdk";

function Editor({ storage }) {
  const { yDoc } = useYjsStorage(storage.content);
  const { awareness, status } = useYjsAwareness(storage.content);
  // Supply yDoc and { awareness } to your editor's Yjs collaboration integration.
  // Keep your editor instance stable; clear cursor on blur without leaving the view.
}
```

The existing Yjs hook signature is unchanged. The Awareness instance belongs to the same Y.Doc client as the storage replica. The current cursor wire format uses Yjs relative `anchor` and `head` positions; use generic channels for other shapes. The authenticated `user` field is reserved and overwritten by the server. Content continues to synchronize through the persistence provider, independently of presence.

External extensions receive these APIs through the sandbox bridge. Tickets, session credentials, and WebSockets stay in the host. Subscriptions are tied to the renderer and cleaned up on reload, disposal, resource changes, and access loss. Older sandbox hosts without the additive `presence.version: 1` capability return unavailable results.

A resource must already have reached the server before presence can join its room. Offline/new resources remain editable while presence retries. State expires roughly 30 seconds after an unclean departure; clean departures are immediate.
