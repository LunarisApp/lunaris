import { act, render, screen } from "@testing-library/react";
import type { DockviewApi } from "dockview";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridLayoutProvider, useGridLayoutStore } from "../context";
import { FocusModeOverlay } from "./focus-mode-overlay";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function createMockDockviewApi() {
  return {
    activePanel: {
      api: {
        maximize: vi.fn(),
        exitMaximized: vi.fn(),
      },
    },
    onDidMaximizedGroupChange: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as DockviewApi;
}

function Wrapper({ children }: { children: ReactNode }) {
  return <GridLayoutProvider>{children}</GridLayoutProvider>;
}

/**
 * Helper component that sets up mock dockview API and exposes toggle.
 * Renders children so FocusModeOverlay shares the same store.
 */
function FocusModeHarness({
  children,
  onReady,
}: {
  children: ReactNode;
  onReady: (actions: { toggle: () => void }) => void;
}) {
  const setDockviewApi = useGridLayoutStore((s) => s.setDockviewApi);
  const toggleFocusMode = useGridLayoutStore((s) => s.toggleFocusMode);

  // Set mock API on first render
  const mockApi = createMockDockviewApi();
  if (!useGridLayoutStore((s) => s.dockviewApi)) {
    setDockviewApi(mockApi);
  }

  onReady({ toggle: toggleFocusMode });

  return <>{children}</>;
}

describe("FocusModeOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when not in focus mode", () => {
    const { container } = render(
      <Wrapper>
        <FocusModeOverlay />
      </Wrapper>
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows toast when entering focus mode", () => {
    let toggle: (() => void) | undefined;

    render(
      <Wrapper>
        <FocusModeHarness
          onReady={(a) => {
            toggle = a.toggle;
          }}
        >
          <FocusModeOverlay />
        </FocusModeHarness>
      </Wrapper>
    );

    expect(screen.queryByText("focusMode.exitHint")).toBeNull();

    act(() => toggle!());

    expect(screen.getByText("focusMode.exitHint")).toBeDefined();
  });

  it("hides toast after 2 seconds", () => {
    let toggle: (() => void) | undefined;

    render(
      <Wrapper>
        <FocusModeHarness
          onReady={(a) => {
            toggle = a.toggle;
          }}
        >
          <FocusModeOverlay />
        </FocusModeHarness>
      </Wrapper>
    );

    act(() => toggle!());

    const toast = screen.getByText("focusMode.exitHint");
    // Initially visible (opacity-100)
    expect(toast.className).toContain("opacity-100");

    // After 2 seconds, should fade (opacity-0)
    act(() => vi.advanceTimersByTime(2000));

    expect(toast.className).toContain("opacity-0");
  });
});
