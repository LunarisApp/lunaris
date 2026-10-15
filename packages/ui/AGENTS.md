# UI Package (@lunarisapp/ui)

Shared UI built on **Base UI** primitives + **Shadcn** patterns.

## Structure

- `src/components/` - Shadcn-style components (auto-injected, lint ignored)
- `src/blocks/` - Composite components with `/index.tsx` entry
- `src/lib/utils.ts` - `cn()` helper (clsx + tailwind-merge)
- `src/hooks/` - Shared hooks

## Component Patterns

- Wrap Base UI primitives: `<ButtonPrimitive>` from `@base-ui/react`
- Use `cva` (class-variance-authority) for variant props
- Apply styles via `cn(buttonVariants({ variant, size, className }))`
- Add `data-slot="button"` for CSS targeting

## Testing

Tests colocated: `button.tsx` -> `button.test.tsx`

```tsx
import { axe } from "vitest-axe";
const { container } = render(<Button>Click</Button>);
expect((await axe(container, { rules: { region: { enabled: false } } })).violations).toEqual([]);
```

Run: `bun run test --filter=@lunarisapp/ui`

## Exports

- `@lunarisapp/ui/components/button` - Components
- `@lunarisapp/ui/blocks/confirmation-dialog` - Blocks
- `@lunarisapp/ui/lib/utils` - Utilities
