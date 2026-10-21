# Extension catalog data and assets

Refresh with `bun run --cwd apps/landing extensions:sync`. The generated `src/data/extension-catalog.ts` contains the official registry entries plus the three built-ins. Page builds and requests use that local snapshot. The displayed catalog date is the upstream registry's `generatedAt` value.

The sync script uses the app's marketplace/release parsers from `packages/plugin-sdk`, verifies each published descriptor's byte length and SHA-256, and reads version, API, and permissions from the pinned release. It does not execute or download extension code. Names, keywords, descriptions, repository URLs, and release metadata remain publisher-owned. Localized interface copy and concise descriptions live in `src/data/extensions.ts`; new entries fall back to publisher descriptions.

Sources:

- [Official registry](https://raw.githubusercontent.com/LunarisApp/extensions/HEAD/marketplace.json), checked 2026-10-21. The registry contains Excalidraw, Exporter, Mini Apps, Spreadsheet, and Northstar Pulse (Demo). The demo remains explicitly named as a demo.
- Built-in metadata: `extensions/{rich-text,kanban,file}/src/manifest.json`.
- Built-in icons/screenshots: `internal/workspaces/src/features/extensions/assets/`.
- Catalog icons: rendered directly from the publisher’s `iconUrl` or pinned descriptor icon URL. The sync script stores the URL without downloading or copying the icon.
- Excalidraw screenshot: [publisher asset](https://raw.githubusercontent.com/LunarisApp/extensions/main/extensions/excalidraw/screenshot.webp).
- Extension behavior: pinned release metadata and the extension repositories. The current development README can describe unreleased changes; published metadata takes precedence for versions, permissions, and API requirements.

Built-in icons reuse the existing app assets through static imports. Catalog icons use their original URLs and a neutral fallback if loading fails. Only screenshots are copied into `public/img/extensions/`, resized to at most 1600px and encoded as WebP. No fabricated previews. Detail pages omit screenshots when the publisher supplies none.

Installation stays inside Lunaris. Built-ins can be enabled/disabled per workspace; catalog extensions use install/update/uninstall. The public catalog never simulates installation or edits a workspace.
