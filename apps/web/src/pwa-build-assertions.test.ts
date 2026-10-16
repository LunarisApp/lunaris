import { describe, expect, it } from "vitest";
import {
  extractUniquePrecacheUrls,
  findMissingPrecacheUrls,
  isGeneratedServiceWorkerFile,
} from "../scripts/pwa-build-assertions";

describe("PWA build assertions", () => {
  it("extracts unique precache URLs", () => {
    const urls = extractUniquePrecacheUrls(
      '{url:"index.html"},{url:"assets/app.js"},{url:"index.html"}'
    );

    expect([...urls]).toEqual(["index.html", "assets/app.js"]);
  });

  it("reports build assets missing from the precache", () => {
    expect(
      findMissingPrecacheUrls(
        ["index.html", "assets/app.js", "assets/editor.js"],
        ["index.html", "assets/app.js"]
      )
    ).toEqual(["assets/editor.js"]);
  });

  it("accepts a complete precache regardless of duplicate entries", () => {
    expect(
      findMissingPrecacheUrls(
        ["index.html", "assets/app.js"],
        ["index.html", "assets/app.js", "assets/app.js"]
      )
    ).toEqual([]);
  });

  it("excludes generated service-worker files", () => {
    expect(isGeneratedServiceWorkerFile("sw.js")).toBe(true);
    expect(isGeneratedServiceWorkerFile("workbox-a1B2_c3.js")).toBe(true);
    expect(
      findMissingPrecacheUrls(
        ["index.html", "sw.js", "workbox-a1B2_c3.js"],
        ["index.html"]
      )
    ).toEqual([]);
  });
  it("excludes runtime discovery but still requires static well-known files", () => {
    expect(
      findMissingPrecacheUrls(
        [
          "/.well-known/lunaris-servers",
          "/.well-known/lunaris-regions",
          "/.well-known/security.txt",
        ],
        []
      )
    ).toEqual([".well-known/security.txt"]);
  });
});
