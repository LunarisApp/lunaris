# Shared UI

Build shared controls from Base UI primitives and existing Shadcn-style wrappers.
Follow nearby `cva` variants, `cn()` class composition, and `data-slot` selectors.
Keep composite blocks in `src/blocks/` and shared hooks in `src/hooks/`.

## Verification and exports

Colocate component tests as `*.test.tsx`. For changed interactions, cover keyboard
behavior, accessible names, and focus handling; use existing `vitest-axe` tests
where appropriate. Read [lunaris-dev](../../.agents/skills/lunaris-dev/SKILL.md)
for check selection.

`src/components` has Biome exclusions; review edited components explicitly rather
than treating a passing global check as coverage. Preserve the public import
paths declared in `package.json` when changing components or blocks.
