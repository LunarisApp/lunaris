# Changesets

Add a changeset for:

- every supported API change in `@lunarisapp/plugin-sdk` or `@lunarisapp/ui`;
- every user-visible CLI or Desktop change.

Run `bun changeset`, select each affected public/release package, choose its
SemVer impact, and write a user-facing summary. The two public packages version
independently. Documentation, tests, and private internal-only changes can omit
a changeset.

Changesets version packages only. Publishing `@lunarisapp/plugin-sdk` and
`@lunarisapp/ui` remains a separate, explicitly authorized release step.
