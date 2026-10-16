import { describe, expect, it } from "vitest";
import { formatDesktopBuildVersion } from "./build-version";

describe("formatDesktopBuildVersion", () => {
  it("uses a concise label for local builds", () => {
    expect(formatDesktopBuildVersion({})).toBe("local");
  });

  it("uses only the release version", () => {
    expect(
      formatDesktopBuildVersion({
        LUNARIS_BUILD_SHA: "1234567890",
        LUNARIS_BUILD_VERSION: "1.2.3",
        LUNARIS_SIGNING_MODE: "signed",
      })
    ).toBe("1.2.3");
  });
});
