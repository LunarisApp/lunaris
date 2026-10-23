import { loadRuntimeConfig } from "./runtime-config";

declare const __RUNTIME_CONFIG__: boolean;

try {
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
} catch (error) {
  const root = document.getElementById("root");
  if (root) {
    root.setAttribute("role", "alert");
    root.textContent =
      "Unable to load application configuration. Reconnect and reload.";
  }
  throw error;
}
