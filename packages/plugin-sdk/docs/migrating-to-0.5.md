# Migrating from 0.4 to 0.5

SDK 0.5 makes status-bar content part of resource views. External extensions
must rebuild for sandbox protocol 3.

- Remove `contributions.status(...)` registrations.
- Move each status renderer to the corresponding resource view's optional
  `statusBar` property.
- Read view params, resource identity, and storage identity from
  `ResourceViewStatusProps`.

Status-bar content now renders only while its owning view is active and unloads
atomically with that view.
