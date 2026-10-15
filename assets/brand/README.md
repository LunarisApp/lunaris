# Lunaris brand assets

Files in `source/` are canonical. Edit or replace these SVGs, then regenerate
all application assets:

```sh
bun run brand:generate
```

Generated outputs are committed because landing, web, and native packaging
consume them directly. Do not edit files under these paths by hand:

- `apps/desktop/public/favicon*`
- `apps/desktop/src-tauri/icons/`
- `apps/landing/public/apple-touch-icon.png`
- `apps/landing/public/favicon*`
- `apps/landing/public/img/lunaris-mark-*.svg`
- `apps/web/public/apple-touch-icon.png`
- `apps/web/public/favicon*`
- `apps/web/public/pwa-*.png`

CI runs `bun run brand:check`. It regenerates assets in a temporary directory
and fails when committed outputs differ.

Dark app icon is default native, touch, and PWA icon. Transparent marks switch
with browser color scheme.
