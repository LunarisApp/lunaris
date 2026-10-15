# 0001: Organize the workspace with resources

- Status: Accepted
- Date: 2026-10-14

## Context

Users need to keep related work together: notes, files, whiteboards, tasks, and
specialized tools. These things store different kinds of data, but should share
an intuitive way to name, organize, find, and reopen them.

A model built only around text documents or files is too narrow. Giving every
tool its own navigation would scatter related work across the application.

## Decision

Use **resources** as the common unit of workspace organization. A resource is a
workspace entity with a stable identity that represents a specific scope of data
or work. It can hold content, group other resources, or wrap a saved interaction.

Users organize resources by what they mean, without needing to know how they
are stored.

### What can be a resource?

| Resource | What it represents |
| --- | --- |
| Rich text document | A particular piece of writing |
| File | An uploaded file and its metadata |
| Whiteboard | A drawing or visual planning space |
| Task or board | A work item or collection of related work |
| Folder | A named group of resources |
| Dashboard wrapper | A dashboard configured for a particular project or dataset |

For example, a “Project Atlas dashboard” resource could save filters and data
references, then open a dedicated dashboard page. It would not need to copy or
own the data it displays. This is an example of what the model supports, not a
claim that a dashboard extension is bundled.

A resource need not be a physical file or editable document. It should represent
something specific that is useful to name, organize, and reopen. General settings
and transient utilities can remain standalone views or application tools.

### Identity, type, and view

- **Resource instance:** one saved entity, identified by `resourceId`, with a name
  and a place in the hierarchy where applicable.
- **Resource type:** defines its data schema and storage needs.
- **Resource view:** the interface used to display or work with it.

One resource can have several compatible views, such as an editor and preview.
Changing or closing a view does not change or delete the resource. Navigation and
resource actions use `resourceId`, independent of panels, URLs, or backing Yjs
documents.

### Storage

Types declare named Yjs, key-value, or file slots. A type can use `storage: {}`
when it needs only resource identity and metadata. Views declare the slots they
need and receive access through host-issued handles.

Wrappers may save configuration and read other data through permitted host
capabilities or external services. Referencing data does not grant access to it
or make it available offline. Views must handle missing data, lost access, and
connection requirements.

Extensions add resource types and views through the public API described in
[ADR 0003](0003-extensible-workspace-platform.md).

## Alternatives considered

- **Everything is a text document:** unsuitable for files, drawings, and specialized
  interfaces.
- **Everything is a file or path:** awkward for tasks, structured data, and saved
  dashboards.
- **Each tool has its own model:** fragments workspace organization.
- **Views own content identity:** makes multiple views of the same data harder.

## Consequences

Different kinds of work share one organization model. New types can reuse workspace
behavior while providing their own interfaces.

Types need clear schemas and compatibility rules. Generic actions cannot assume
that every resource supports editing text, downloading a file, or exporting.
Use concrete names such as “file” or “whiteboard” in product copy when clearer
than “resource”.

## References

- [Resource contract](../../packages/plugin-sdk/docs/resources.md)
- [Resource views](../../packages/plugin-sdk/docs/views.md)
- [Named storage slots](../../packages/plugin-sdk/docs/storage.md)
- [Extension authoring examples](../../apps/docs/content/developers/extensions/resources-and-views.mdx)
- [Offline-first architecture](0002-offline-first.md)
