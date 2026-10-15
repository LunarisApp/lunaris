# Migrating to SDK 0.9

SDK 0.9 replaces compiler-specific integration with generic services and slots.
It is a hard cut with sandbox protocol 6.

- Set manifest `api` to `^0.9.0` and rebuild the artifact with protocol 6.
- Declare non-blocking integrations in `optionalDependencies`.
- Replace compile context names with `PluginResourceReadContext` and
  `resourceReadContext`.
- Replace `@lunarisapp/plugin-sdk/compile` with `/data`.
- Replace representation registrations with a provider-owned service slot.
- Use `useDownloads().save(...)` and declare `downloads.write` for generated
  files.

There is no SDK 0.8 or protocol 5 compatibility layer.
