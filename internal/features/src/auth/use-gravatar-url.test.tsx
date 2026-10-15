import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGravatarUrl } from "./use-gravatar-url";

describe("useGravatarUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined when email is missing", () => {
    const { result } = renderHook(() => useGravatarUrl(undefined));

    expect(result.current).toBeUndefined();
  });

  it("produces the same URL for the same normalized email", async () => {
    const { result, rerender } = renderHook(
      ({ email }) => useGravatarUrl(email),
      { initialProps: { email: " USER@example.com " } }
    );

    await waitFor(() => expect(result.current).toContain("gravatar.com/avatar"));
    const firstUrl = result.current;

    rerender({ email: "user@example.com" });

    expect(result.current).toBe(firstUrl);
  });

  it("reuses a cached URL synchronously on remount", async () => {
    const email = "cached@example.com";
    const firstRender = renderHook(() => useGravatarUrl(email, 128));

    await waitFor(() =>
      expect(firstRender.result.current).toContain("gravatar.com/avatar")
    );
    const cachedUrl = firstRender.result.current;
    firstRender.unmount();

    const secondRender = renderHook(() => useGravatarUrl(email, 128));

    expect(secondRender.result.current).toBe(cachedUrl);
  });

  it("changes URL when size changes", async () => {
    const { result, rerender } = renderHook(
      ({ size }) => useGravatarUrl("size@example.com", size),
      { initialProps: { size: undefined as number | undefined } }
    );

    await waitFor(() => expect(result.current).toContain("gravatar.com/avatar"));
    const defaultSizeUrl = result.current;

    rerender({ size: 128 });

    await waitFor(() => expect(result.current).toContain("&s=128"));
    expect(result.current).not.toBe(defaultSizeUrl);
  });

  it("does not warn after unmounting before hash resolution", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderHook(() => useGravatarUrl("cancel@example.com"));

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleError).not.toHaveBeenCalled();
  });
});
