/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceLine,
  TraceTitle,
} from "./trace";

afterEach(cleanup);

it("expands and collapses a named trace from the keyboard", async () => {
  const user = userEvent.setup();
  render(
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status="running">
            <TraceTitle>Reading file</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>Report.md</TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );

  const toggle = screen.getByRole("button", { name: "Reading file" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  await user.tab();
  expect(document.activeElement).toBe(toggle);
  await user.keyboard("{Enter}");
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("Report.md")).toBeTruthy();
  await user.keyboard(" ");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(toggle);
});
