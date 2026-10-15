# Extension SDK reference

## Entry points

- `@lunarisapp/plugin-sdk`: manifests, definitions, descriptors, handles, hooks, and host capabilities.
- `@lunarisapp/plugin-sdk/data`: focused KV/Yjs hooks, pure YMap/YArray hooks,
  and resource-first Yjs reconstruction helpers.
- `@lunarisapp/plugin-sdk/time`: extension-safe time helpers.
- `@lunarisapp/plugin-sdk/worker`: typed one-shot dedicated worker tasks.

`@lunarisapp/plugin-sdk/internal` is host-only and semver-exempt.

`definePlugin` validates the strict manifest and API compatibility. Its
`activate` registers resources, views, commands, services, slots, search
indexers, search query providers, workspace storage, locales, and staged effects.
Resource views may provide optional status-bar content.
Manifests do not list registrations.
Activation, commit, effect startup, rollback, and cleanup are owned by the
host's Cordis scope.

### Search contributions

`contributions.searchIndexer(...)` registers plain-text extraction for targeted
resource types or schema versions. The host supplies a validated resource
payload and envelope. Calling the indexer requires `content.read`; its scoped
`context.readFile(input.storage.cover)` additionally requires `files.read`.
Returning `null` or blank text removes that indexer's entry for the resource.

`contributions.searchQuery(...)` registers a federated query provider with
cursor pagination and an `open` handler. Its query context exposes the scoped
`PluginFetch` transport. Providers are lifecycle-complete in 0.6 but are not
yet consumed by the built-in search interface.

Permissions are explicit: `content.read`, `content.write`, `files.read`,
`files.write`, `downloads.write`, and `network.https`. SDK hooks reject
undeclared capabilities. Required `dependencies`, non-blocking
`optionalDependencies`, and conflicts are plugin-ID-to-semver-range maps.
Missing or incompatible dependencies keep an extension pending. It activates
when compatible providers appear and suspends if they become unavailable.

## Storage

- `ResourceTypeDefinition.storage`: required named slot map; `{}` means none.
- `ResourceViewDefinition.storageRequirements`: required slot-name/kind subset.
- `ResourceStorageHandle`: opaque `{ storageId, kind }` handle.
- `useYjsStorage(handle)`: hydrated Yjs document and persistence provider.
- `useKeyValue(handle, key)`: subscribed resource KV value and mutations.
- `useStoredFile(handle)`: file state, metadata, bytes, and object URL.
- `useFileStorage()`: named file upload/replacement and download actions.
- `defineWorkspaceStorage(...)` and `contributions.workspaceStorage(...)`: declared extension-private workspace KV.
- `useWorkspaceKeyValue(descriptor, key)`: subscribed workspace KV value.

## Resource-first capabilities

`ResourceCommandContext` contains `resourceId`, `storage`, `resourceReadContext`,
`downloadFile`, `waitForYjsPersistence`, and `openView`.

`PluginResourceReadContext` exposes `getWorkspaceResource(resourceId)`,
`getWorkspaceResourceChildren(parentId)`, `getYjsStorageUpdates(handle)`, and
`resolveResource(resourceId)`. Read resources and workspace resources include
named handles. `reconstructYjsDoc` and `withYjsDoc` are exported from `/data`.

## Services, slots, and downloads

`definePluginService` creates a versioned, provider-owned namespace.
Providers use `services.provide`; consumers declare the provider in required or
optional dependencies and use `services.require`/`services.optional` plus
`usePluginService`. `slots.contribute` and `usePluginServiceSlot` provide
deterministic multibind discovery. Registrations follow extension activation
scope and rebind when providers return.

`useDownloads().save({ suggestedName, mimeType, data })` requests a
host-mediated save. It requires `downloads.write`, accepts `ArrayBuffer`, and
rejects payloads larger than 64 MiB.

`ResourcePayloadContext` contains `resourceId` plus hydrated `storage` entries.
Yjs entries expose documents, KV entries expose staged snapshots, and file
entries expose read-only metadata.

## Lifecycle and permissions

Activation registers resources, views, commands, services, slots, locales, and
workspace storage descriptors atomically in a Cordis-owned scope. Disabling or
reloading removes registrations and effects but preserves durable data.

Permissions remain explicit: `content.read`, `content.write`, `files.read`,
`files.write`, `downloads.write`, and `network.https`. Host operations validate
workspace, resource, slot, kind, extension session, and permissions.

## Worker tasks

`runPluginWorkerTask(createWorker, input, options)` creates one worker, sends
structured-cloneable input, and terminates it after a result, error, abort, or
timeout. Timeout defaults to 30 seconds. Pass `options.transfer` when input
buffers may be detached instead of copied.

Worker modules call `exposePluginWorkerTask(handler)`. Returned `ArrayBuffer`
values, including nested buffers, transfer automatically. Tasks are pure local
computation: no host bridge, DOM, storage, network, or progress channel.

External extension workers must be dedicated inline workers:

```ts
import TaskWorker from "./task.worker?worker&inline";
import { runPluginWorkerTask } from "@lunarisapp/plugin-sdk/worker";

const output = await runPluginWorkerTask<string, string>(
  () => new TaskWorker({ name: "acme-task" }),
  "input",
);
```

```ts
// task.worker.ts
import { exposePluginWorkerTask } from "@lunarisapp/plugin-sdk/worker";

exposePluginWorkerTask((input: string) => input.toUpperCase());
```
