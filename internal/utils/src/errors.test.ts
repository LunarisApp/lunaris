import { describe, expect, test } from "bun:test";
import { EvlogError } from "evlog";
import { AppError, PluginError, StorageError, SyncError } from "./errors";

describe("AppError", () => {
  test("constructs from string", () => {
    const err = new AppError("something broke");
    expect(err.message).toBe("something broke");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(EvlogError);
    expect(err).toBeInstanceOf(AppError);
  });

  test("constructs from options with why and fix", () => {
    const err = new AppError({
      message: "sync failed",
      why: "network unreachable",
      fix: "check your connection",
    });
    expect(err.message).toBe("sync failed");
    expect(err.why).toBe("network unreachable");
    expect(err.fix).toBe("check your connection");
  });
});

describe("SyncError", () => {
  test("constructs from string", () => {
    const err = new SyncError("conflict detected");
    expect(err.message).toBe("conflict detected");
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(SyncError);
  });

  test("constructs from options", () => {
    const err = new SyncError({
      message: "merge failed",
      why: "concurrent edits on same document",
    });
    expect(err.message).toBe("merge failed");
    expect(err.why).toBe("concurrent edits on same document");
  });
});

describe("StorageError", () => {
  test("constructs from string", () => {
    const err = new StorageError("db write failed");
    expect(err.message).toBe("db write failed");
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(StorageError);
  });

  test("constructs from options", () => {
    const err = new StorageError({
      message: "quota exceeded",
      why: "IndexedDB full",
      fix: "clear browser storage",
    });
    expect(err.message).toBe("quota exceeded");
    expect(err.why).toBe("IndexedDB full");
    expect(err.fix).toBe("clear browser storage");
  });
});

describe("PluginError", () => {
  test("constructs from string", () => {
    const err = new PluginError("init failed");
    expect(err.message).toBe("init failed");
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(PluginError);
  });

  test("constructs from options", () => {
    const err = new PluginError({
      message: "renderer crashed",
      why: "invalid content type",
    });
    expect(err.message).toBe("renderer crashed");
    expect(err.why).toBe("invalid content type");
  });
});

describe("instanceof chain", () => {
  test("all errors are instanceof Error, EvlogError, AppError", () => {
    const errors = [
      new SyncError("a"),
      new StorageError("b"),
      new PluginError("c"),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(EvlogError);
      expect(err).toBeInstanceOf(AppError);
    }
  });
});
