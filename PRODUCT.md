# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Lunaris serves individual writers and knowledge workers, plus startup and enterprise teams. They create, organize, and collaborate on structured documents across web and desktop environments. Community developers and enterprise engineering teams also extend Lunaris with reusable or organization-specific tools.

## Product Purpose

Lunaris is an offline-first, cross-platform word processor and workspace. It helps people create and organize documents and related workspace material, work reliably without a network connection, collaborate when cloud capabilities are appropriate, and shape the organization through extensions instead of accepting a fixed all-in-one feature set.

Success means users can keep writing and accessing their work regardless of connectivity, choose how sensitive data is stored, use one coherent organization for individual and team workflows, and add specialized capabilities without bloating the focused core.

## Positioning

Lunaris is an extension-led, offline-first alternative to its two primary current competitors, Obsidian and Notion. It combines a focused document workspace with built-in collaboration, optional content tools, device-only handling for sensitive files, and flexible data residency.

Against Obsidian, Lunaris pairs local-first control and extensibility with collaboration designed into the organization, including shared editing, team access, and permissions. Against Notion, Lunaris starts from a focused offline-first core and lets extensions shape the organization, while giving users more control over where workspaces live.

Extensions are a major product differentiator. Community developers can build tools for the broader ecosystem, while enterprises can build private internal extensions such as admin panels, operational tools, and organization-specific workflows.

## Operating Context

- The same shared application shell powers the web and Tauri desktop apps.
- Users work within organizations, workspaces, and workspace hierarchies.
- Workspaces can combine rich-text documents, files, kanban boards, diagrams, AI chat, and compiler tooling through bundled or external extensions.
- Users can add community-built extensions, while enterprises can create private internal extensions for company-specific workflows, admin panels, and internal tools.
- Cloud-enabled workflows include synchronization and collaborative editing; offline and local-only workflows must remain usable without cloud access.
- People evaluating Lunaris commonly compare it with Obsidian for local files, extensions, and personal knowledge work, and with Notion for collaborative workspaces and broad team tooling.
- The interface supports desktop and mobile browser layouts.

## Capabilities and Constraints

- Offline-first data access and editing are core product behavior.
- Sensitive files may remain on-device through local-first options.
- Deployments and accounts need flexibility in data residency.
- Yjs provides collaborative document editing, while PowerSync coordinates synchronized application data.
- The public extension SDK and extension host make extensions a first-class product surface rather than an integration afterthought.
- Extension support covers community-built tools and private enterprise extensions. Private extensions may provide internal admin panels, operational tools, and organization-specific workflows inside Lunaris.
- The focused core should remain useful on its own; extensions add specialized capabilities without making every organization carry the same feature set.
- Web and desktop share product behavior through `internal/app-shell`; platform-specific wrappers should not fork the core experience without a product reason.
- Lunaris supports individual accounts and organization-based team workflows with permissions.
- The application is localized in English, German, Spanish, French, and Brazilian Portuguese.

## Brand Commitments

- Product name: Lunaris.
- Canonical brand assets live in `assets/brand/source/` and generate application-specific icons and marks.
- Use **extensions** in user-facing product language. Use **extensions** for implementation details, package names, SDK APIs, and host architecture.
- Existing product terminology around organizations, workspaces, documents, views, extensions, and local/cloud access should remain consistent.

## Evidence on Hand

- Working web, desktop, and shared app-shell implementations.
- Canonical Lunaris marks and app icons in `assets/brand/source/`.
- Implemented bundled extensions for rich text, files, kanban, diagrams, AI chat, and compiler workflows.
- A public TypeScript and React extension SDK, external extension build path, sandboxed host, and catalog support are implemented under `packages/plugin-sdk` and `internal/workspaces/src/extensions/`.
- Implemented authentication, organization membership, permissions, offline storage, synchronization, collaboration, localization, and responsive shells.
- Current source-backed comparison pages identify Obsidian and Notion as the primary competitors: `apps/landing/src/app/[locale]/compare/obsidian/` and `apps/landing/src/app/[locale]/compare/notion/`.
- No approved testimonials, customer logos, benchmarks, or market claims are recorded here; future work must not fabricate them.

## Product Principles

1. Keep creation and access dependable offline.
2. Give users control over device-only storage, cloud use, and data residency.
3. Preserve one coherent core experience across web and desktop.
4. Support both focused individual writing and structured team collaboration.
5. Keep the core focused, then let community and private enterprise extensions shape specialized organizations without weakening reliability or user control.

## Accessibility & Inclusion

Accessibility is a durable product commitment. Preserve keyboard operation, semantic labeling, skip navigation, responsive layouts, localized interfaces, and the available OpenDyslexic reading option.
