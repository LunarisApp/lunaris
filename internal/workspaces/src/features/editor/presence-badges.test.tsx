import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PresenceBadges } from "./presence-badges";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(cleanup);
describe("resource header participants", () => {
  it("hides empty membership and shows accessible overflow", () => {
    const view = render(
      <PresenceBadges participants={[]} self={null} status="connected" />
    );
    expect(screen.queryByRole("button")).toBeNull();
    view.rerender(
      <PresenceBadges
        participants={Array.from({ length: 5 }, (_, i) => ({
          id: String(i),
          name: `Viewer ${i}`,
          image: "",
          color: "#1d4ed8",
        }))}
        self={null}
        status="connected"
      />
    );
    expect(
      screen.getByRole("button", { name: "resourcePresence.viewParticipants" })
    ).toBeTruthy();
    expect(screen.getByText("+2")).toBeTruthy();
  });
  it("announces an outage quietly", () => {
    render(<PresenceBadges participants={[]} self={null} status="error" />);
    expect(screen.getByRole("status").textContent).toContain(
      "resourcePresence.unavailable"
    );
  });
});
