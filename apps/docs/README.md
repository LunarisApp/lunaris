# Lunaris documentation

User and extension-developer documentation for [docs.lunaris.app](https://docs.lunaris.app),
built with Next.js, Nextra, and MDX. Pagefind supplies production search.

## Development

From the repository root:

```sh
bun install
bun run dev:docs
```

Use the URL printed by Next.js. When running beside the API or landing site,
choose another port with `bun run --cwd apps/docs dev --port 3002`.

## Editing documentation

Add `.mdx` pages under `content/`. Colocated `_meta.ts` files control sidebar
labels and ordering; `mdx-components.tsx` provides MDX component integration.

Write around user tasks and observable behavior. Keep implementation details
in the relevant app or package README. Extension-author guides belong under
[`content/developers/extensions`](content/developers/extensions).

## Verify and build

```sh
bun run --cwd apps/docs typecheck
bun run build --filter=docs
bun run --cwd apps/docs start
```

The build indexes pages into `public/_pagefind`. Check search in production
mode (`start`), along with links and sidebar navigation.

## License

Lunaris-owned documentation and code use [Apache-2.0](../../LICENSE).
Third-party content retains its own terms; see
[third-party notices](../../THIRD-PARTY-NOTICES.md).
