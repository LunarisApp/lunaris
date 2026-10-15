# @lunarisapp/plugin-sdk

## 0.12.0

### Minor Changes

- [`019697a`](https://github.com/LunarisApp/lunaris/commit/019697a54fa900999490f36f2c2e23e324bff34f) Thanks [@MrLightful](https://github.com/MrLightful)! - Remove deprecated catalog exports and unused attachment type aliases. This is a breaking change for consumers of these exports.
  
  Import marketplace functions and types from `@lunarisapp/plugin-sdk/marketplace` instead of `/catalog`. Replace `PluginAttachmentStatus`, `PluginAttachmentRow`, `PluginFileAttachmentState`, `PluginFileAttachmentUploadInput`, and `UploadFileAttachment` with `PluginStoredFileStatus`, `PluginStoredFile`, `PluginStoredFileState`, `PluginFileStorageUploadInput`, and `StorePluginFile`. The current file state uses `file` instead of `attachment`, and metadata uses `fileId` instead of `attachmentId`.

## 0.11.0

### Minor Changes

- Add sandbox protocol 7 with bounded Yjs update history and state-vector recovery; compatible hosts continue accepting protocol 6 and API 0.9 extensions.
- Add cancellable chunked downloads with a 256 MiB host-enforced limit while retaining the existing 64 MiB download API.
- Emit `runtime.json` build metadata and support canvas-based spreadsheet bundles with inline workers.

## 0.10.0

### Minor Changes

- [#556](https://github.com/LunarisApp/lunaris/pull/556) [`b9267c4`](https://github.com/LunarisApp/lunaris/commit/b9267c4fe8c10b7a1769cbae5185d08522ba1f47) Thanks [@MrLightful](https://github.com/MrLightful)! - Rename the Workspace domain to Organization and the Project domain to Workspace across extension APIs.

- [#550](https://github.com/LunarisApp/lunaris/pull/550) [`29fa515`](https://github.com/LunarisApp/lunaris/commit/29fa5150f84af8350da13f854d4b372e4789c35e) Thanks [@MrLightful](https://github.com/MrLightful)! - Add recoverable resource trash with 30-day retention, restore, and permanent deletion. Extension hosts can now identify trashed workspace resources.

## 0.9.4

### Patch Changes

- [#542](https://github.com/LunarisApp/lunaris/pull/542) [`f8142df`](https://github.com/LunarisApp/lunaris/commit/f8142df3f1ad284451092ba38b7787edf1b29350) Thanks [@MrLightful](https://github.com/MrLightful)! - Add typed one-shot worker tasks and inline worker support for sandboxed extensions.

## 0.9.3

### Patch Changes

- Allow extension icon artifacts to use any detected raster image format.

## 0.9.2

### Patch Changes

- Add optional long descriptions, keywords, and website metadata to extension manifests.

## 0.9.1

### Patch Changes

- Deduplicate React, ReactDOM, and Yjs in external extension builds and reject bundles containing multiple singleton runtimes.

## 0.9.0

### Breaking Changes

- Add required and optional manifest dependencies with Cordis lifecycle
  suspension, rebinding, and scoped disposal.
- Add namespaced services, unary JSON/`ArrayBuffer` RPC, and multibind slots.
- Rename compile-era resource readers to `PluginResourceReadContext` and move
  Yjs reconstruction helpers from `/compile` to `/data`.
- Remove compiler-specific representation contracts and hooks.
- Add permission-scoped, host-mediated downloads with a 64 MiB limit.
- Upgrade external extension sandbox protocol to version 6.

## 0.7.0

### Minor Changes

- [#497](https://github.com/LunarisApp/lunaris/pull/497) [`08b3d83`](https://github.com/LunarisApp/lunaris/commit/08b3d837a585f406826cb6397ddf02056ff6844b) Thanks [@MrLightful](https://github.com/MrLightful)! - Replace singular resource storage with named composable slots, typed handles,
  view requirements, declared workspace KV, resource-first APIs, and sandbox
  protocol 5.

## 0.6.0

### Minor Changes

- Add Cordis-managed search indexer and federated query-provider contributions.
- Upgrade external extension sandbox protocol to version 4.

## 0.5.0

### Minor Changes

- [#493](https://github.com/LunarisApp/lunaris/pull/493) - Attach optional
  status-bar renderers to resource views so status content follows the active
  view and shares its lifecycle and context.

## 0.4.0

### Major architecture refactor

- Replace content types and renderers with orthogonal resources and views.
- Add independently targeted commands, statuses, and representation providers.
- Remove manifest contributions and all 0.3 compatibility aliases.
- Upgrade external extensions to sandbox protocol 2.
- Add versioned Standard Schema resource validation and lazy migration support.
- Distinguish registered `resourceTypeId`/`viewId` definitions from persisted
  `resourceId` and open `viewInstanceId` instances throughout the SDK.
- Use `Resource*` for SDK resource instances while retaining `WorkspaceResource*`
  at persistence, API, and cross-workspace boundaries.

## 0.3.0

### Minor Changes

- [#478](https://github.com/LunarisApp/lunaris/pull/478) - Simplify content-type metadata and support runtime-defined custom creation.

- [#479](https://github.com/LunarisApp/lunaris/pull/479) - Adopt the activation-based API 0.3.0 with strict manifests, permissions, dependencies, conflicts, and Cordis-managed lifecycle.

## 0.2.0

### Minor Changes

- [#477](https://github.com/LunarisApp/lunaris/pull/477) [`c81d8b6`](https://github.com/LunarisApp/lunaris/commit/c81d8b61c8aa07b5f46c108cc33bedf329d3a71b) Thanks [@MrLightful](https://github.com/MrLightful)! - Require complete declarative content-type and view manifests for SDK contract
  0.0.5 so hosts can register extensions without executing their implementations.

## 0.1.2

### Patch Changes

- [#476](https://github.com/LunarisApp/lunaris/pull/476) [`db0cb79`](https://github.com/LunarisApp/lunaris/commit/db0cb7987151483c079e915e1f0aeeeb4a3bf896) Thanks [@MrLightful](https://github.com/MrLightful)! - Add generic workspace file storage hooks and action capabilities for every extension.

## 0.1.1

### Patch Changes

- Wait for sandboxed Yjs documents to hydrate before exposing them to extensions, isolate document instances when renderer inputs change, and forward persistence-state subscriptions.

## 0.1.0

### Minor Changes

- [#472](https://github.com/LunarisApp/lunaris/pull/472) [`3d5344a`](https://github.com/LunarisApp/lunaris/commit/3d5344a71c5b4afdc515d5a5c940a5c5fc0d6fc8) Thanks [@MrLightful](https://github.com/MrLightful)! - Rename Lunaris extension copy, source paths, manifests, and host components from plugin terminology to extension terminology. Extension manifests are now named `manifest.json`; existing protocol and storage identifiers remain compatible.

## 0.0.5

### Patch Changes

- [#458](https://github.com/LunarisApp/lunaris/pull/458) [`9716942`](https://github.com/LunarisApp/lunaris/commit/97169427dda772c2dd8724447ffc927da043d3e7) Thanks [@MrLightful](https://github.com/MrLightful)! - Add external attachment uploads and scoped local `srcdoc` renderer sandbox support.

## 0.0.4

### Patch Changes

- [#447](https://github.com/LunarisApp/lunaris/pull/447) [`8eb988b`](https://github.com/LunarisApp/lunaris/commit/8eb988bf2fb71dbfa7379486d008eee27bf787ed) Thanks [@MrLightful](https://github.com/MrLightful)! - Add extension store metadata.

## 0.0.3

### Patch Changes

- [#423](https://github.com/LunarisApp/lunaris/pull/423) [`117ce86`](https://github.com/LunarisApp/lunaris/commit/117ce8656a5815fc6ea09e6453436423355da8c0) Thanks [@MrLightful](https://github.com/MrLightful)! - Sandbox external extensions with iframe RPC.

## 0.0.2

### Patch Changes

- [#419](https://github.com/LunarisApp/lunaris/pull/419) [`1c1ce5c`](https://github.com/LunarisApp/lunaris/commit/1c1ce5c18e897d660173442d96670839599e492d) Thanks [@MrLightful](https://github.com/MrLightful)! - Rename organization panel contributions to views.
