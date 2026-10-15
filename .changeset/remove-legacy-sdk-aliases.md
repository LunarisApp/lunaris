---
"@lunarisapp/plugin-sdk": minor
---

Remove deprecated catalog exports and unused attachment type aliases. This is a breaking change for consumers of these exports.

Import marketplace functions and types from `@lunarisapp/plugin-sdk/marketplace` instead of `/catalog`. Replace `PluginAttachmentStatus`, `PluginAttachmentRow`, `PluginFileAttachmentState`, `PluginFileAttachmentUploadInput`, and `UploadFileAttachment` with `PluginStoredFileStatus`, `PluginStoredFile`, `PluginStoredFileState`, `PluginFileStorageUploadInput`, and `StorePluginFile`. The current file state uses `file` instead of `attachment`, and metadata uses `fileId` instead of `attachmentId`.
