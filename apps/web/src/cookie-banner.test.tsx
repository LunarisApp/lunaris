import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { registerCookieBanner } = vi.hoisted(() => ({
  registerCookieBanner: vi.fn(),
}));

vi.mock("@probo/cookie-banner", () => ({ registerCookieBanner }));

function setUrl(url: string) {
  (
    window as typeof window & {
      happyDOM: { setURL(nextUrl: string): void };
    }
  ).happyDOM.setURL(url);
}

afterEach(() => {
  registerCookieBanner.mockReset();
  vi.unstubAllEnvs();
  vi.resetModules();
  setUrl("http://localhost:3000");
});

describe("ProboCookieBanner", () => {
  it("keeps an inaccessible settings sentinel mounted outside preferences", async () => {
    vi.stubEnv("VITE_PROBO_COOKIE_BANNER_ID", "banner-id");
    vi.stubEnv("VITE_PROBO_COOKIE_BANNER_BASE_URL", "https://probo.test");
    setUrl("https://web.lunaris.app");

    const { ProboCookieBanner, proboCookieBannerEnabled } = await import(
      "./cookie-banner"
    );
    const banner = ProboCookieBanner();

    expect(proboCookieBannerEnabled).toBe(true);
    expect(registerCookieBanner).toHaveBeenCalledOnce();
    expect(isValidElement<{ children?: ReactNode }>(banner)).toBe(true);
    if (!isValidElement<{ children?: ReactNode }>(banner)) {
      throw new Error("Cookie banner fragment missing");
    }

    const children = Children.toArray(banner.props.children) as ReactElement[];
    expect(children).toHaveLength(2);
    expect(children[0]?.type).toBe("probo-cookie-banner");
    expect(children[1]).toMatchObject({
      props: {
        "aria-hidden": true,
        hidden: true,
        role: "presentation",
        tabIndex: -1,
      },
      type: "probo-settings-link",
    });
  });
});
