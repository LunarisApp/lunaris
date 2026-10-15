import type { LunarisTauriStorage } from "@repo/auth/tauri-client";
import { invoke } from "@tauri-apps/api/core";

export const getAuthSecret = (key: string) =>
  invoke<string | null>("auth_secret_get", { key });

export const setAuthSecret = (key: string, value: string) =>
  invoke<void>("auth_secret_set", { key, value });

export const keychainStorage: LunarisTauriStorage = {
  getItem: getAuthSecret,
  setItem: setAuthSecret,
};
