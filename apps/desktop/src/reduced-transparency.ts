import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export async function syncReducedTransparency() {
  const root = document.documentElement;
  let receivedUpdate = false;
  await listen<boolean>(
    "lunaris-reduce-transparency-changed",
    ({ payload }) => {
      receivedUpdate = true;
      root.toggleAttribute("data-reduce-transparency", payload);
    }
  );

  const reduceTransparency = await invoke<boolean>(
    "desktop_reduce_transparency"
  );
  if (!receivedUpdate) {
    root.toggleAttribute("data-reduce-transparency", reduceTransparency);
  }
}
