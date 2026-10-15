# Changesets

Run `bun changeset` for releasable changes to:

- `@lunarisapp/plugin-sdk` and `@lunarisapp/ui`;
- hosted `api`, `web`, `docs`, and `landing` apps.

Select each affected target, including consumers of changed private libraries.
Each target versions independently. Feature PRs target `next`; hotfix PRs target
`main` and use patch bumps only. Test/repository-documentation-only changes can
omit a changeset; hosted docs content needs a `docs` changeset.

`bun run release:version` consumes only these six targets. CLI/Desktop changesets
are preserved for their separate release process. Never run unscoped
`changeset version` in release automation.

See [release and deployment procedures](../docs/procedures/releasing-and-deploying.md)
for setup, release approval, npm publication, Railway deployment, and retries.
