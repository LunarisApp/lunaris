# External extension sandbox

Catalog extensions execute inside an `iframe` with `sandbox="allow-scripts"` and
without `allow-same-origin`. Extension JavaScript cannot access Lunaris DOM,
cookies, origin storage, navigation, or globals.

Frame Content Security Policy blocks direct network, nested frames, forms, and
objects. A hash-pinned bootstrap, restricted to the opaque-origin frame, creates
the verified extension blob inside that frame. Extension CSS stays inside its frame.

Host interaction uses sandbox protocol 6 over a dedicated `MessagePort`.
Registration metadata and requests are validated before host use. Removing or
disabling an extension closes ports, removes frames, and revokes blob URLs.

Protocol 6 additionally serializes unary JSON/`ArrayBuffer` services,
multibind slot handlers, and host-mediated downloads. It also serializes named
resource handles, multiple Yjs slots, KV snapshots and subscriptions, declared
workspace KV, and named file operations. Every host
call validates the current workspace, resource, slot kind, extension session, and
permission. Forged, cross-workspace, and cross-extension handles fail.

Bundled first-party extensions remain trusted in-process code. Permission grants,
network transport policy, and CPU/memory quotas are separate controls.
