# Lunaris documentation

User and extension-developer documentation for [docs.lunaris.app](https://docs.lunaris.app),
built with Next.js and Fumadocs. Fumadocs indexes the MDX content for search.

## Development

From the repository root:

```sh
bun install
bun run dev:docs
```

Use the URL printed by Next.js. When running beside the API or landing site,
choose another port with `bun run --cwd apps/docs dev --port 3002`.

## Editing documentation

Add `.mdx` pages under `content/` with a frontmatter title and description.
Use a single page heading in the body. Colocated `meta.json` files control
sidebar labels and order. Add new pages to the relevant sidebar entries.

The content path sets the public URL. For example, `content/getting-started/index.mdx`
is served at `/getting-started`. Extension-author guides live under
[`content/developers/extensions`](content/developers/extensions).
Keep implementation details in the relevant app or package README.

## Verify and build

```sh
bun run --cwd apps/docs typecheck
bun run build --filter=docs
bun run --cwd apps/docs start
```

Search uses `/api/search` in development and production. Check search, links,
and sidebar navigation after starting the site.

## License

Lunaris-owned documentation and code use [MIT](../../LICENSE).
Third-party content retains its own terms; see
[third-party notices](../../THIRD-PARTY-NOTICES.md).
