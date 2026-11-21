# Lunaris documentation

User and developer documentation for [docs.lunaris.app](https://docs.lunaris.app),
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
is served at `/getting-started`. Group guides by reader in `personal/`, `teams/`,
`customize/`, and `administration/`. Put lookup tables and recovery steps in
`reference/`. Put SDK and CLI guides under [`content/developers`](content/developers).
Keep implementation details in the relevant app or package README.
When moving or merging a public page, add its old path to
[`lib/legacy-routes.mjs`](lib/legacy-routes.mjs). The same map covers Markdown URLs.

## Translations

English uses unprefixed URLs. Spanish, French, German, and Brazilian Portuguese
use `/es`, `/fr`, `/de`, and `/pt-BR`, like the landing site. To translate a
page, add its locale before the extension. For example,
`content/getting-started/index.fr.mdx` serves `/fr/getting-started`. Keep the
original slug and reuse the existing sidebar order. A page without a translation
shows its English content with a notice. UI and sidebar strings are in
[`lib/i18n.ts`](lib/i18n.ts).

## Markdown for agents

Fumadocs generates `/llms.txt` from the docs navigation. The index links to
each page as Markdown, including `/index.md` for the overview. Read the entire
site at `/llms-full.txt` or a section at a URL such as `/personal/llms-full.txt`.
Localized indexes use URLs such as `/fr/llms.txt` and `/fr/llms-full.txt`.

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
