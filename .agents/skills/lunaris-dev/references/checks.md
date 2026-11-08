# Review and validate

Review the diff for correctness, regressions, accessibility, and unnecessary complexity.
Choose checks by changed files and behavior. Read affected package scripts first.

| Change | Check |
| --- | --- |
| Application code or configuration | `bun run check` (global Biome check) |
| TypeScript | `bun run typecheck --filter=<package-name>` |
| Behavior | `bun run test --filter=<package-name>` and relevant existing tests |
| Package boundaries or exports | Relevant package build; `bun run build` when needed |
| User flows | `bun run e2e` with local services running |
| UI | Browser verification; [screenshots](screenshots.md) when useful |

Use actual package names from `package.json`. Broaden typechecks or tests when shared changes affect multiple packages.
Fix formatting only in affected files; avoid whole-repo `check:fix` unless requested.
Rerun failed checks after fixes. Report failures and skipped checks with their reasons.

Documentation-only changes need link, command, and diff validation, not application tests.
For skill changes, validate frontmatter and relative links. For shell helpers, run shell syntax checks.
Use [review-logging-patterns](../../review-logging-patterns/SKILL.md) for substantial logging changes or requested logging reviews.
