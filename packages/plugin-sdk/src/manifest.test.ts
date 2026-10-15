import { describe, expect, it } from "vitest";
import {
  ApiVersionMismatchError,
  ManifestValidationError,
  validateManifest,
  validateSupportedManifest,
} from "./manifest";

const validManifest = {
  api: "^0.9.0",
  conflicts: {},
  dependencies: {},
  description: "Example extension",
  developer: "Acme",
  id: "acme.example",
  name: "Example",
  optionalDependencies: {},
  permissions: [],
  version: "1.0.0",
};

describe("validateManifest", () => {
  it("accepts compatible contribution-free manifests", () => {
    expect(validateManifest(validManifest, "0.9.0")).toEqual(validManifest);
  });

  it("accepts optional extension details metadata", () => {
    const manifest = {
      ...validManifest,
      keywords: ["diagram", "whiteboard"],
      website: "https://example.com/extensions/example",
    };

    expect(validateManifest(manifest)).toEqual(manifest);
  });

  it("accepts extension IDs that match object prototype names", () => {
    expect(validateManifest({ ...validManifest, id: "constructor" })).toMatchObject({
      id: "constructor",
    });
  });

  it.each([
    [null, "manifest must be an object"],
    [{ ...validManifest, id: "Bad_ID" }, "lowercase segments"],
    [{ ...validManifest, description: "" }, "description is required"],
    [{ ...validManifest, longDescription: "" }, "longDescription must be a non-empty string"],
    [{ ...validManifest, keywords: [""] }, "keywords must contain at most"],
    [{ ...validManifest, keywords: ["diagram", "DIAGRAM"] }, "keywords must not contain duplicates"],
    [{ ...validManifest, website: "http://example.com" }, "website must be a valid HTTPS URL"],
    [{ ...validManifest, version: "latest" }, "valid semver"],
    [{ ...validManifest, api: "latest" }, "valid semver range"],
    [{ ...validManifest, legacy: true }, "unknown field: legacy"],
    [{ ...validManifest, contributions: [] }, "unknown field: contributions"],
    [
      { ...validManifest, permissions: ["system.root"] },
      "permissions must be one of",
    ],
    [
      {
        ...validManifest,
        conflicts: { "acme.dependency": "^1.0.0" },
        dependencies: { "acme.dependency": "^1.0.0" },
      },
      "cannot depend on and conflict",
    ],
    [
      {
        ...validManifest,
        dependencies: { "acme.dependency": "^1.0.0" },
        optionalDependencies: { "acme.dependency": "^1.0.0" },
      },
      "cannot be both required and optional",
    ],
    [
      {
        ...validManifest,
        conflicts: { "acme.dependency": "^1.0.0" },
        optionalDependencies: { "acme.dependency": "^1.0.0" },
      },
      "optionally depend on and conflict",
    ],
  ])("rejects invalid manifest %#", (manifest, message) => {
    expect(() => validateManifest(manifest)).toThrow(message as string);
  });

  it("rejects incompatible API ranges", () => {
    expect(() =>
      validateSupportedManifest({ ...validManifest, api: "^0.6.0" }),
    ).toThrow(ApiVersionMismatchError);
    expect(() => validateManifest(validManifest, "2.0.0")).toThrow(
      ApiVersionMismatchError,
    );
  });
});

describe("ManifestValidationError", () => {
  it("keeps field and extension ID", () => {
    const error = new ManifestValidationError("acme.example", "id", "bad");
    expect(error.pluginId).toBe("acme.example");
    expect(error.field).toBe("id");
  });
});
