import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useQuery, useSuspenseQuery } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useSuspenseQuery: vi.fn(),
}));

vi.mock("@powersync/react", () => ({ useQuery, useSuspenseQuery }));

import {
  createPreferencesService,
  getAllPreferences,
  getPreference,
  removePreference,
  setPreference,
  usePreferencesQuery,
  usePreferencesSuspenseQuery,
} from "./services";

describe("preference services", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds plugin and keyed hook queries", () => {
    useQuery.mockReturnValue({ data: [] });
    useSuspenseQuery.mockReturnValue({ data: [] });
    const options = { runQueryOnce: true };

    renderHook(() => usePreferencesQuery({ pluginId: "acme.notes", options }));
    renderHook(() =>
      usePreferencesSuspenseQuery({
        key: "theme",
        options,
        pluginId: "acme.notes",
      }),
    );

    expect(useQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE plugin_id = ?"),
      ["acme.notes"],
      options,
    );
    expect(useSuspenseQuery).toHaveBeenCalledWith(
      expect.stringContaining("AND key = ?"),
      ["acme.notes", "theme"],
      options,
    );
  });

  it("reads one or all plugin preferences", async () => {
    const db = {
      getAll: vi.fn().mockResolvedValue([]),
      getOptional: vi.fn().mockResolvedValue({ key: "theme", value: "dark" }),
    };

    await getPreference({ db: db as never, key: "theme", pluginId: "acme.notes" });
    await getAllPreferences({ db: db as never, pluginId: "acme.notes" });

    expect(db.getOptional).toHaveBeenCalledWith(
      expect.stringContaining("plugin_id = ? AND key = ?"),
      ["acme.notes", "theme"],
    );
    expect(db.getAll).toHaveBeenCalledWith(
      expect.stringContaining("WHERE plugin_id = ?"),
      ["acme.notes"],
    );
  });

  it("inserts missing preferences and updates existing values", async () => {
    const insertDb = {
      execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      getOptional: vi.fn().mockResolvedValue(null),
    };
    await setPreference({
      db: insertDb as never,
      key: "theme",
      pluginId: "acme.notes",
      value: "dark",
    });
    expect(insertDb.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO preferences"),
      expect.arrayContaining(["acme.notes", "theme", "dark"]),
    );

    const updateDb = {
      execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      getOptional: vi.fn().mockResolvedValue(true),
    };
    await setPreference({
      db: updateDb as never,
      key: "theme",
      pluginId: "acme.notes",
      value: "light",
    });
    expect(updateDb.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE preferences SET value = ?"),
      ["light", "acme.notes", "theme"],
    );
  });

  it("binds convenience service methods to one plugin", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockResolvedValue([]),
      getOptional: vi.fn().mockResolvedValue(null),
    };
    const service = createPreferencesService(db as never, "acme.notes");

    await service.get("theme");
    await service.getAll();
    await service.set("theme", "dark");
    await service.remove("theme");

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM preferences"),
      ["acme.notes", "theme"],
    );
  });

  it("removes one preference", async () => {
    const db = { execute: vi.fn().mockResolvedValue(undefined) };

    await removePreference({
      db: db as never,
      key: "theme",
      pluginId: "acme.notes",
    });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM preferences"),
      ["acme.notes", "theme"],
    );
  });
});
