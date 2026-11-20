# Updating shadcn/ui in Lunaris

Use the Base Nova registry selected by [components.json](components.json). On
2026-11-20 the package exported all 64 file-backed `registry:ui` entries.
The registry also lists `form` without source files. Lunaris supplies its own
React Hook Form implementation at that subpath. Documentation examples, blocks
and entries in the optional re/ui and Dice UI registries have separate inventories.

[Base Nova registry](https://ui.shadcn.com/r/styles/base-nova/registry.json) ·
[Upstream revision reviewed](https://github.com/shadcn-ui/ui/tree/f50887ae68d0fdcbfbe86b57be08af94a4c88a68) ·
[Component documentation index](https://ui.shadcn.com/llms.txt)

## Differences to preserve

| Components | Local contract and reason |
| --- | --- |
| Button, Card, Input, InputGroup, Textarea, Combobox, Select, NativeSelect | Card and field surfaces follow the app theme. Outline buttons and select triggers use the accent hover color. Ghost buttons expose pressed, expanded and current-page states. Default primary buttons have wider horizontal padding at default and large sizes. See the shared styling change in `1e3f383`. |
| Alert, Badge | Keep the warning alert and the success and warning badge variants. Callers use semantic status colors independent of theme. See `1e3f383`. |
| Menus, Dialog, AlertDialog, Drawer, Sheet, Popover, HoverCard, Tooltip, Chart and toasts | Floating surfaces share `app-overlay-surface`; modal backdrops share `app-modal-backdrop`. Menubar inherits its popup styling from DropdownMenu. Tooltip arrows inherit the popup fill and accept `arrowClassName`; Kbd keeps readable colors inside that surface. Preserve the solid fallback, forced-colors rules, app transparency preference and WebKit-compatible media queries in [overlays.css](src/overlays.css). See `1e3f383` and `eb95905`. |
| Drawer, Sheet | Both respect platform safe areas. Drawer bodies can scroll, and `DrawerMenuItem` provides a touch-sized action that closes the drawer, with destructive and disabled states. The [responsive menu](src/blocks/responsive-dropdown-menu) and [mobile user menu](../../internal/features/src/user-menu/mobile-user-menu.tsx) depend on drawer behavior. |
| Command, InputGroup | Workspace search passes an `endAdornment` to `CommandInput`. The clear button accepts a localized label and returns focus to the visible input or textarea before clearing. Addon clicks also focus the field even when the form contains a hidden input. See [search](../../internal/workspaces/src/features/search/components/search-dialog.tsx) and the [keyboard tests](src/components/input-group.test.tsx). |
| Dialog | `DialogContent.closeLabel` localizes the close button's accessible name and defaults to “Close”. See [workspace creation](../../internal/workspaces/src/features/new-workspace/index.tsx) and the [dialog test](src/components/dialog.test.tsx). |
| DropdownMenu | Item class names accept a Base UI state callback. Resolve it with the item state before merging classes so consumers can style individual states. |
| Avatar | The public `AvatarSize` includes `xl` for [account settings](../../internal/features/src/settings/tabs/account.tsx). The image, fallback and border inherit the root radius so changing the shape affects all three. |
| ScrollArea | Keep orientation (including both axes), gutter, fade, viewport classes and props, and the composed viewport refs. The [presentation viewer](../../extensions/file/src/components/extend/pptx-viewer.tsx) passes the viewport to its virtualizer. Forwarding that ref to the outer root would measure the wrong element. |
| Spinner, Sonner, Toast | The shared quarter-ring Spinner supports size and stroke width and becomes static under reduced motion (`44ed083`). Both toast paths use it. Sonner also announces errors assertively and other notifications politely. Keep both public paths and Sonner's theme integration. |
| Sidebar | The inset uses the app's card color and border. The wrapper persists the desktop preference in its cookie. The initial import (`864d022`) already omitted upstream's global Cmd/Ctrl+B listener. The original reason is undocumented. Keeping the shortcut available to the host editor is an inferred benefit. |
| CodeBlock and highlighting | The copy button honors a caller-cancelled click and shows success only when the clipboard write succeeds. Unsupported language names render as plain text, including names inherited by ordinary JavaScript objects. Only grammar-backed languages carry Shiki state between lines. |

Lunaris also owns components outside this registry, including Tree, Kanban and
ColorPicker. Preserve their separate public subpaths during registry updates.

## Repeat the comparison

1. Check the preset and aliases in `components.json`. The following command
   lists the file-backed UI entries. For each name, compare its registry JSON
   with `src/components/<name>.tsx` and its export in `package.json`.

   ```sh
   curl -fsSL https://ui.shadcn.com/r/styles/base-nova/registry.json |
     jq -r '.items[] | select(.type == "registry:ui" and (.files | length) > 0) | .name' | sort
   ```

2. Fetch `https://ui.shadcn.com/r/styles/base-nova/<name>.json`. Review each
   entry in `files`, `dependencies` and `registryDependencies`, including hooks
   and their helpers. Compare behavior after mapping registry aliases to public
   package subpaths and icon placeholders to the configured Hugeicons. Account
   for CLI style markers, formatting and class order when reading a raw diff.
3. For a meaningful mismatch, use `git log -p -- packages/ui/src/components/<name>.tsx`
   and search callers and tests. Merge upstream fixes around the contracts above.
   Compare [upstream Tailwind utilities](https://github.com/shadcn-ui/ui/blob/f50887ae68d0fdcbfbe86b57be08af94a4c88a68/packages/shadcn/src/tailwind.css)
   with `src/globals.css` and `src/shadcn-utilities.css` when classes change.
4. Add explicit subpath exports and a changeset for new public APIs. Run
   `bun run public:reports`, then `bun run public:validate` and the package
   checks in the [README](README.md#contributing). Refresh this record with
   the upstream revision, inventory and any newly established local contracts.
