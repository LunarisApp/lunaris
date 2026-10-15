# Features Package

UI features for Lunaris. Each feature = self-contained module with React components, hooks, state.

## Structure

```
src/
  feature-name/
    index.tsx     # Re-exports public API
    context.tsx   # Zustand store + Provider + hooks (if stateful)
    types.ts      # Type definitions
    components/   # Sub-components
    hooks/        # Custom hooks
    services/     # Business logic
```

## Patterns

- **State**: Use Zustand with `createStore` + React context pattern
- Store created in ref: `useRef<Store | null>(null)`
- Provider wraps context; hooks throw outside provider
- **Exports**: Via `@repo/features/{feature}` (maps to `src/{feature}/index.tsx`)
- **Dockview**: Grid layout uses dockview; register renderers via `register(pluginId, renderer, builder)`
- **Yjs integration**: Workspace explorer syncs with Yjs via `externalActions` prop

## Dependencies

- `zustand` - State management
- `dockview` - Panel/tab layout
- `yjs` - CRDT for hierarchy sync
- `@lunarisapp/ui` - UI components
- `@repo/data` - Data layer
