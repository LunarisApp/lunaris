# Validate changes

1. Review the diff and affected package scripts. Select checks by changed behavior and consumers.
2. Run the checks below that apply. Fix failures introduced by the change and rerun those checks.
3. Report results, remaining failures, and any relevant behavior left unverified. Broaden checks only when dependencies or failures justify it.

| Change | Validation |
| --- | --- |
| Application code/configuration | `bun run check` from root |
| TypeScript | `bun run typecheck --filter=<package-name>`; include affected consumers for shared changes |
| Behavior | Relevant existing tests via the package's test script; root `bun run test --filter=<package-name>` runs the package suite |
| Package boundaries/exports | Affected package builds; use root `bun run build` for broader integration |
| User flows | Relevant Cypress specs in `apps/e2e`; use [setup](run-locally.md) first |
| UI | Exercise affected interactions; use [screenshots](screenshots.md) when visual evidence adds value |
| Documentation/skills only | Verify paths, links, commands, frontmatter, and `git diff --check` |
| Shell helpers | Syntax check with the script's shell, plus relevant behavior checks |

API tests use `bun:test`; frontend unit/component tests use Vitest. Follow nearby
test conventions when adding coverage.

Resolve package names and available scripts from `package.json`. Fix formatting
in affected files; use whole-repo `check:fix` only when requested. Inspect Biome
exclusions before claiming a file was linted.

For a requested branch/PR review, use [code-review](../../code-review/SKILL.md).
For substantial logging changes or a requested logging review, use
[review-logging-patterns](../../review-logging-patterns/SKILL.md).
