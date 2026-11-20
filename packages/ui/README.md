# @lunarisapp/ui

React components, dialogs, hooks, icons, and theme styles shared by Lunaris and
its extensions. Built on Base UI primitives, Shadcn patterns, and Tailwind CSS.

## Use in your project

```sh
bun add @lunarisapp/ui react react-dom tailwindcss
```

Use React 19 and Tailwind CSS 4 versions compatible with the peer dependencies
in [package.json](package.json). Configure Tailwind processing in your bundler,
then import the theme once at your application's entry point:

```tsx
import "@lunarisapp/ui/globals.css";
import { Button } from "@lunarisapp/ui/components/button";

export function SaveButton() {
  return <Button type="submit">Save changes</Button>;
}
```

The stylesheet includes Tailwind, theme tokens, and component class scanning.
Its base styles apply globally.

## Public imports

There is no root barrel export. Import through the explicit subpaths in
[package.json](package.json):

| Subpath | Purpose |
| --- | --- |
| `/components/button`, `/components/dialog`, etc. | Individual components |
| `/blocks/confirmation-dialog`, `/blocks/rename-dialog`, etc. | Composed UI flows |
| `/hooks/use-mobile`, etc. | Shared React hooks |
| `/lib/highlighter`, `/hooks/use-highlighted-code` | Syntax highlighting for static and streamed code |
| `/lib/utils` | `cn()` class-name helper |
| `/icons`, `/brand-icons` | Icon exports |
| `/globals.css` | Application theme and component styles |
| `/overlays.css` | Floating-surface utilities for Tailwind themes that supply their own colors |
| `/workbench.css` | Workbench-specific styles |

Menus, popovers, dialogs, and drawers apply the shared glass surface automatically.
For a custom floating control, apply `app-overlay-surface` to its outer container.
The utility is included in `/globals.css`. It uses the popover theme colors and
falls back to a solid fill when blur is unavailable or transparency is reduced.

Import only exported paths; package-local test helpers and source paths are
not part of the public API. For Lunaris extensions, start with the
[plugin SDK](../plugin-sdk/README.md).

## Contributing

From the Lunaris repository root:

```sh
bun install
bun run build --filter=@lunarisapp/ui
bun run --cwd packages/ui typecheck
bun run --cwd packages/ui test
bun run public:validate
```

See [component conventions and accessibility tests](AGENTS.md). Add a changeset
for public API changes. For shadcn updates, follow the
[registry comparison and customization notes](SHADCN.md).

## License

Lunaris-owned code uses [MIT](LICENSE). Upstream components, icons, and
libraries retain their own terms; consult the repository's
[third-party notices](../../THIRD-PARTY-NOTICES.md).
