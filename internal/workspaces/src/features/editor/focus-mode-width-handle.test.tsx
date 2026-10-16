import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { FocusModeWidthHandle } from "./focus-mode-width-handle";

const { setWidth } = vi.hoisted(() => ({ setWidth: vi.fn() }));
vi.mock("../grid-layout/context", () => ({
  FOCUS_MODE_WIDTH_MIN: 320,
  useGridLayoutStore: (
    select: (state: {
      focusModeWidth: number;
      setFocusModeWidth: typeof setWidth;
    }) => unknown
  ) => select({ focusModeWidth: 600, setFocusModeWidth: setWidth }),
}));
beforeEach(() => setWidth.mockClear());
it("supports directional resize and min/max shortcuts from the keyboard", () => {
  const outerRef = createRef<HTMLDivElement>();
  outerRef.current = document.createElement("div");
  vi.spyOn(outerRef.current, "getBoundingClientRect").mockReturnValue({
    width: 1000,
  } as DOMRect);
  const view = render(
    <FocusModeWidthHandle outerRef={outerRef} side="right" />
  );
  const handle = view.getByRole("separator", { name: "Resize content width" });
  expect(handle.tabIndex).toBe(0);
  expect(handle.getAttribute("aria-valuenow")).toBe("600");
  expect(handle.getAttribute("aria-valuemax")).toBe("1000");
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(setWidth).toHaveBeenLastCalledWith(620);
  fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
  expect(setWidth).toHaveBeenLastCalledWith(500);
  fireEvent.keyDown(handle, { key: "Home" });
  expect(setWidth).toHaveBeenLastCalledWith(320);
  fireEvent.keyDown(handle, { key: "End" });
  expect(setWidth).toHaveBeenLastCalledWith(1000);
  view.rerender(<FocusModeWidthHandle outerRef={outerRef} side="left" />);
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(setWidth).toHaveBeenLastCalledWith(580);
  view.unmount();
});
