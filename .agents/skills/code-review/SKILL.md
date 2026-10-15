---
name: code-review
description: Use after completing code changes to catch issues early. Surfaces code quality validation commands. Also use when asked about linting, formatting, typechecking, code quality checks, or fixing lint/format issues.
---

# Code Quality Tools

Run these in order of speed. Fix issues at each step before moving to the next.

## 1. Lint & Format

```sh
bun run check        # read-only — reports lint/format violations
bun run check:fix    # auto-fixes what it can
```

Biome/ultracite. Catches style violations, unused imports, suspicious patterns.
Always run globally (no `--filter`). Run `check:fix` first, then `check` to verify.

## 2. Typecheck

```sh
bun run typecheck                       # all packages
bun run typecheck --filter={workspace}  # single package
```

TypeScript across all workspaces. Catches type errors, missing imports, wrong signatures.
Use `--filter` when changes are scoped to one package.

## 3. Unit Tests

```sh
bun run test                            # all packages
bun run test --filter={workspace}       # single package
bun run test:coverage                   # with coverage report
```

Vitest. Catches logic regressions, broken APIs, edge cases.
Coverage target: 80%+. Use `--filter` for scoped changes.

## 4. Build

```sh
bun run build
```

Catches build-time errors: missing exports, circular deps, asset issues.
Run when changes touch package boundaries or exports.

## 5. E2E Tests

```sh
bun run e2e    # from root; needs web, API, and local services running
```

Cypress. Catches integration failures, broken user flows.
Use for feature-level changes that affect user-facing behavior.

## 6. Logging patterns
Use `review-logging-patterns` skill to ensure new code follows our logging best practices.

## 7. Usability Testing

Use `agent-browser` skill to manually verify features in the browser.
Best for new features or significant UI changes — confirms the feature works as a user would expect.
