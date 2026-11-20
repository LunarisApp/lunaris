# Lunaris website

The marketing website for Lunaris, built with Next.js. This directory is part of
the Lunaris product and is not distributed as a website template or starter kit.

## Development

From the repository root:

```sh
bun install
bun run dev:landing
```

Use the URL printed by Next.js. To avoid the API's default port, run
`bun run --cwd apps/landing dev --port 3001` from the repository root.

## Working on the website

- `src/app/`: pages and route handlers.
- `src/i18n/`: locale configuration and translated dictionaries.
- `src/data/`: product copy, pricing data, and region discovery.
- `src/markdown/`: hand-written Markdown companions for public pages.
- `public/`: static assets, including the product demo in `video/demo.mp4`.

Keep product claims and pricing consistent with the application and supported plans.

## Markdown companions

Register public pages in `src/data/landing-pages.ts`. For pages with a companion,
add the entry to `markdownPages` and the corresponding file under
`src/markdown/`. Use `index.md` for the homepage and mirror the URL for other
pages, such as `compare/obsidian.md`. Next.js generates `/llms.txt` and the
Markdown responses during the build. Set `section` on pages worth listing in the
root index. The sitemap includes all registered pages. The shared HTML head
links to `/llms.txt` with `rel="describedby"`. Pages with a Markdown
companion advertise it in a `Link` header.

The pricing and comparison companions render tables from the same data as the
web pages. The MCP companion renders setup commands and configuration for each
available cloud region, the macOS Desktop preview, and the CLI. Edit each
companion's Markdown file to adjust its introductory content.

The Extensions companion links to `/extensions/llms.txt`, which lists individual
extension companions generated from the catalog. To customize an individual
extension's Markdown, add `src/markdown/extensions/<slug>.md`.

## Verify and build

```sh
bun run --cwd apps/landing typecheck
bun run --cwd apps/landing test
bun run build --filter=landing
bun run --cwd apps/landing start
```

## Licensing

This directory contains Tailwind Plus components and templates, including
modified versions. The [original Tailwind Plus license](LICENSE.md) is retained
verbatim. Tailwind Labs retains copyright in its components and templates.

The root MIT license does **not** apply to Tailwind Plus components,
templates, or code and assets derived from them. Modifying that material does
not change its license. Independently authored Lunaris code is covered by the
root [MIT license](../../LICENSE), unless otherwise specified; other
third-party material retains its own terms.

The Tailwind Plus license permits open-source end products, while restricting
redistribution of its components and templates separately from an end product.
Their presence in this repository does not grant an MIT license to extract
or redistribute them as components, templates, or a starter kit.

When contributing, preserve the applicable license notices and identify any new
third-party material and its origin. Do not assume a file is MIT merely
because it has been modified or lacks an individual license header. Check its
origin and the applicable license before reusing it outside Lunaris. Questions
about Tailwind Plus permissions can be sent to
[Tailwind Labs](mailto:support@tailwindcss.com).
