# @repo/platform

Platform abstractions for cross-platform compatibility (web, desktop, mobile).

## Platform Boundary

Shared frontend code calls semantic capabilities through `usePlatform()`:
- agent access
- clipboard
- downloads
- navigation
- network state
- operating-system detection
- panel windows
- viewport queries

Apps create a `Platform` with `createBrowserPlatform()` and inject any
app-specific managers. Keep Tauri and other native imports inside app
implementations.

## Adding Abstractions

When adding new platform abstractions:
1. Define a semantic interface in `src/platform.ts`
2. Export from `src/index.ts`
3. Add browser/WebView behavior in `src/browser.ts`
4. Inject native managers from respective apps
