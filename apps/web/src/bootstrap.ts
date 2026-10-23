import { loadRuntimeConfig } from "./runtime-config";

declare const __RUNTIME_CONFIG__: boolean;

async function bootstrap() {
  if (__RUNTIME_CONFIG__) {
    let storage: Storage | undefined;
    try {
      storage = localStorage;
    } catch {
      /* Private browsing may disable storage. */
    }
    await loadRuntimeConfig({ request: fetch, storage });
  }
  await import("./main");
}

// Finish evaluating the entry before importing the app: production chunks may
// import shared helpers from this entry, which would deadlock a top-level await.
bootstrap().catch((error: unknown) => {
  const root = document.getElementById("root");
  if (root) {
    root.setAttribute("role", "alert");
    root.textContent =
      "Unable to load application configuration. Reconnect and reload.";
  }
  throw error;
});
