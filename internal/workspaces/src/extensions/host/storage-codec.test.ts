import { describe, expect, it } from "vitest";
import {
  decodePluginStorageValue,
  encodePluginStorageValue,
} from "./storage-codec";

describe("extension storage codec", () => {
  it.each(["true", "42", "null", "{}", "plain text"])(
    "round-trips string %s without changing its type",
    (value) => {
      expect(decodePluginStorageValue(encodePluginStorageValue(value))).toBe(
        value
      );
    }
  );

  it("rejects unencoded strings", () => {
    expect(() => decodePluginStorageValue("plain text")).toThrow(SyntaxError);
  });

  it("rejects values JSON cannot represent", () => {
    expect(() => encodePluginStorageValue(undefined)).toThrow(
      "must be JSON-serializable"
    );
  });
});
