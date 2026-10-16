import { describe, expect, it } from "vitest";
import { analyticsRoutePath } from "./posthog-pageview";

describe("analyticsRoutePath", () => {
  it("keeps public route names", () => {
    expect(analyticsRoutePath("/auth/register")).toBe("/auth/register");
    expect(analyticsRoutePath("/settings/preferences")).toBe(
      "/settings/preferences"
    );
  });

  it("redacts organization, workspace, and item identifiers", () => {
    expect(analyticsRoutePath("/writers-room")).toBe("/:organization");
    expect(analyticsRoutePath("/writers-room/my-novel")).toBe(
      "/:organization/:workspace"
    );
    expect(
      analyticsRoutePath("/writers-room/my-novel/view_123/comments/comment_456")
    ).toBe("/:organization/:workspace/:view/:subview/:item");
  });

  it("normalizes unknown routes", () => {
    expect(analyticsRoutePath("/auth/private-value")).toBe("/auth");
    expect(analyticsRoutePath("/settings/private-value")).toBe("/settings");
  });
});
