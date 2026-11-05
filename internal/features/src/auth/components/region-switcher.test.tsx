import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegionSwitcher } from "./region-switcher";

interface TestRegion {
  id: string;
  label: string;
  status: "active" | "coming-soon";
}

const { regionState } = vi.hoisted(() => {
  const region: TestRegion = {
    id: "local",
    label: "Local",
    status: "active",
  };

  return {
    regionState: {
      region,
      regions: [region],
      setRegion: vi.fn(),
    },
  };
});

vi.mock("../../region", () => ({
  useRegion: () => regionState,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          "auth.regionComingSoon": "soon",
          "auth.regionDescription": "Give your data a place to call home.",
          "auth.regionTitle": "Data region",
        }) as const
      )[
        key as
          | "auth.regionComingSoon"
          | "auth.regionDescription"
          | "auth.regionTitle"
      ] ?? key,
  }),
}));

beforeEach(() => {
  regionState.region = {
    id: "local",
    label: "Local",
    status: "active",
  };
  regionState.regions = [regionState.region];
  regionState.setRegion.mockReset();
});

describe("RegionSwitcher", () => {
  it("renders a muted non-interactive label for one configured region", () => {
    const { container } = render(<RegionSwitcher />);

    expect(container.textContent).toBe("Local (LOCAL)");
    expect(container.querySelector(".text-muted-foreground")).toBeTruthy();
    expect(container.querySelector(".text-center")).toBeTruthy();
    expect(screen.queryByText("Data region")).toBeNull();
    expect(
      screen.queryByText("Give your data a place to call home.")
    ).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the full picker when a coming-soon region is configured", () => {
    regionState.regions = [
      regionState.region,
      {
        id: "eu",
        label: "Europe",
        status: "coming-soon",
      },
    ];

    render(<RegionSwitcher />);

    expect(screen.getByText("Data region")).toBeTruthy();
    expect(
      screen.getByText("Give your data a place to call home.")
    ).toBeTruthy();
    expect(screen.getByRole("group", { name: "Data region" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Local/ }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      (screen.getByRole("button", { name: /Europe/ }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("selects another active region", async () => {
    const user = userEvent.setup();
    regionState.regions = [
      regionState.region,
      {
        id: "us",
        label: "United States",
        status: "active",
      },
    ];

    render(<RegionSwitcher />);
    await user.click(screen.getByRole("button", { name: /United States/ }));

    expect(regionState.setRegion).toHaveBeenCalledWith("us");
  });
});
