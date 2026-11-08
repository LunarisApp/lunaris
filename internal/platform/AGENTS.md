# Platform boundary

Shared frontend code reaches browser/native behavior through `usePlatform()`.
Keep capabilities semantic (clipboard, downloads, navigation, network, agent access,
panel windows), with Tauri/native imports inside app implementations.

For a new capability:

1. Define its interface in `src/platform.ts` and export it through `src/index.ts`.
2. Implement browser/WebView behavior in `src/browser.ts`.
3. Inject app-specific native managers when constructing the platform.
4. Check each affected app's implementation against the shared interface.
