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
| `/lib/utils` | `cn()` class-name helper |
| `/icons`, `/brand-icons` | Icon exports |
| `/globals.css` | Application theme and component styles |
| `/workbench.css` | Workbench-specific styles |

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
for public API changes.

## License

Lunaris-owned code uses [Apache-2.0](LICENSE). Upstream components, icons, and
libraries retain their own terms; consult the repository's
[third-party notices](../../THIRD-PARTY-NOTICES.md).
