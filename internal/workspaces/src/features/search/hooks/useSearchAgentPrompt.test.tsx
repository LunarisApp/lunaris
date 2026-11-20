/** @vitest-environment happy-dom */
import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useSearchAgentPrompt } from "./useSearchAgentPrompt";

const { platform, access } = vi.hoisted(() => ({
  platform: { kind: "desktop", agentWork: {} as object | undefined },
  access: { allowed: true, pending: false },
}));

vi.mock("@repo/platform", () => ({ usePlatform: () => platform }));
vi.mock("@repo/features/entitlements", () => ({
  useFeatureAccess: (feature: string) => {
    expect(feature).toBe("agent-work");
    return access;
  },
}));
vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ organizationSlug: "writing" }),
}));
vi.mock("@repo/features/region", () => ({
  useRegion: () => ({ pathWithRegion: (path: string) => path }),
}));

it.each([
  { kind: "web", manager: true, allowed: true, pending: false, offers: false },
  {
    kind: "desktop",
    manager: false,
    allowed: true,
    pending: false,
    offers: false,
  },
  {
    kind: "desktop",
    manager: true,
    allowed: false,
    pending: false,
    offers: false,
  },
  {
    kind: "desktop",
    manager: true,
    allowed: true,
    pending: true,
    offers: false,
  },
  {
    kind: "desktop",
    manager: true,
    allowed: true,
    pending: false,
    offers: true,
  },
])(
  "offers prompt=$offers on $kind with manager=$manager, access=$allowed, pending=$pending",
  ({ kind, manager, allowed, pending, offers }) => {
    Object.assign(access, { allowed, pending });
    platform.kind = kind;
    platform.agentWork = manager ? {} : undefined;
    const { result, unmount } = renderHook(() =>
      useSearchAgentPrompt("org", "user")
    );
    expect(typeof result.current === "function").toBe(offers);
    unmount();
  }
);
