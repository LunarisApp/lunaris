/** @vitest-environment happy-dom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postHogCapture = vi.fn();

vi.mock("posthog-js", () => ({
  default: { capture: (...args: unknown[]) => postHogCapture(...args) },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      if (vars?.default) {
        return `Default: ${vars.default}`;
      }
      if (vars?.other) {
        return `Conflicts with ${vars.other}`;
      }
      return key;
    },
  }),
}));

// Controllable fake recorder: test drives onRecord / isRecording via refs.
type RecorderState = {
  isRecording: boolean;
  recordedHotkey: string | null;
  onRecord: ((key: string) => void) | null;
};
const recorderState: RecorderState = {
  isRecording: false,
  recordedHotkey: null,
  onRecord: null,
};
const startRecording = vi.fn(() => {
  recorderState.isRecording = true;
});
const stopRecording = vi.fn(() => {
  recorderState.isRecording = false;
  recorderState.recordedHotkey = null;
});
const cancelRecording = vi.fn(() => {
  recorderState.isRecording = false;
  recorderState.recordedHotkey = null;
});

vi.mock("@tanstack/react-hotkeys", () => ({
  useHotkeyRecorder: ({ onRecord }: { onRecord: (key: string) => void }) => {
    recorderState.onRecord = onRecord;
    return {
      isRecording: recorderState.isRecording,
      recordedHotkey: recorderState.recordedHotkey,
      startRecording,
      stopRecording,
      cancelRecording,
    };
  },
}));

import { KeybindingRow } from "./keybinding-row";
import { HotkeyOverridesProvider, useHotkeyOverrides } from "./overrides";
import { HOTKEYS } from "./registry";

function Wrapper({ children }: { children: ReactNode }) {
  return <HotkeyOverridesProvider>{children}</HotkeyOverridesProvider>;
}

beforeEach(() => {
  postHogCapture.mockClear();
  startRecording.mockClear();
  stopRecording.mockClear();
  cancelRecording.mockClear();
  recorderState.isRecording = false;
  recorderState.recordedHotkey = null;
  recorderState.onRecord = null;
});

afterEach(() => {
  window.localStorage.clear();
});

describe("KeybindingRow", () => {
  it("renders the hotkey name and current binding", () => {
    render(
      <Wrapper>
        <KeybindingRow hotkey={HOTKEYS["toggle-search"]} />
      </Wrapper>
    );
    expect(screen.getByText("commands.search")).toBeTruthy();
    expect(
      screen.getByTestId("keybinding-badge-toggle-search").textContent
    ).toMatch(/K/);
  });

  it("reset button is disabled when no override is set", () => {
    render(
      <Wrapper>
        <KeybindingRow hotkey={HOTKEYS["toggle-search"]} />
      </Wrapper>
    );
    const resetBtn = screen.getByTestId("keybinding-reset-toggle-search");
    expect((resetBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("edit click calls startRecording", async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <KeybindingRow hotkey={HOTKEYS["toggle-search"]} />
      </Wrapper>
    );
    await user.click(screen.getByTestId("keybinding-edit-toggle-search"));
    expect(startRecording).toHaveBeenCalledTimes(1);
  });

  it("onRecord sets override + captures posthog + stops recorder", () => {
    render(
      <Wrapper>
        <KeybindingRow hotkey={HOTKEYS["toggle-search"]} />
      </Wrapper>
    );

    recorderState.onRecord!("Mod+J");

    expect(postHogCapture).toHaveBeenCalledWith(
      "keybinding_rebound",
      expect.objectContaining({
        hotkey_id: "toggle-search",
        to: "Mod+J",
      })
    );
    expect(stopRecording).toHaveBeenCalledTimes(1);
  });

  it.each(["", "Mod", "Shift+Alt"])(
    "onRecord rejects invalid capture %j without stopping recorder",
    (invalid) => {
      render(
        <Wrapper>
          <KeybindingRow hotkey={HOTKEYS["toggle-search"]} />
        </Wrapper>
      );

      recorderState.onRecord!(invalid);

      expect(postHogCapture).not.toHaveBeenCalled();
      expect(stopRecording).not.toHaveBeenCalled();
    }
  );

  it("reset clears override + captures posthog", async () => {
    const user = userEvent.setup();

    function Probe() {
      const setOverride = useHotkeyOverrides((s) => s.setOverride);
      setOverride("toggle-search", "Mod+J");
      return null;
    }
    render(
      <Wrapper>
        <Probe />
        <KeybindingRow hotkey={HOTKEYS["toggle-search"]} />
      </Wrapper>
    );

    const resetBtn = screen.getByTestId("keybinding-reset-toggle-search");
    expect((resetBtn as HTMLButtonElement).disabled).toBe(false);

    await user.click(resetBtn);

    expect(postHogCapture).toHaveBeenCalledWith("keybinding_reset", {
      hotkey_id: "toggle-search",
    });
  });

  it("renders default hint when override is active", () => {
    function Probe() {
      const setOverride = useHotkeyOverrides((s) => s.setOverride);
      setOverride("toggle-search", "Mod+J");
      return null;
    }
    render(
      <Wrapper>
        <Probe />
        <KeybindingRow hotkey={HOTKEYS["toggle-search"]} />
      </Wrapper>
    );

    expect(screen.getByText(/Default: /)).toBeTruthy();
  });

  it("warns when the override conflicts with another registered hotkey", () => {
    function Probe() {
      const setOverride = useHotkeyOverrides((s) => s.setOverride);
      // collides with the default binding of workspace settings
      setOverride("toggle-search", "Mod+,");
      return null;
    }
    render(
      <Wrapper>
        <Probe />
        <KeybindingRow hotkey={HOTKEYS["toggle-search"]} />
      </Wrapper>
    );

    expect(screen.getByText(/Conflicts with common.settings/)).toBeTruthy();
  });
});
