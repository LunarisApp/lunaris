import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../locale/locales/en.json";
import { MarketplacesSection } from "./marketplaces-section";
import { DeveloperModeSection } from "./developer-mode-section";

const api = vi.hoisted(() => ({
  baseUrl: "http://localhost:3000",
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@repo/features/api", () => ({ useApi: () => api }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (value, part) => (value as Record<string, unknown>)?.[part],
          en
        ) ?? key,
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const path = "/v1/organizations/org-1/extension-registries";
const official = {
  id: "official",
  official: true,
  location: "https://github.com/LunarisApp/marketplace",
};
const custom = {
  id: "custom",
  official: false,
  location: "https://example.com/marketplace.json",
};

function mount(enabled = false, marketplaces = false) {
  api.get.mockImplementation((url: string) =>
    Promise.resolve(
      url.endsWith("developer-mode") ? { enabled } : [official, custom]
    )
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      {marketplaces ? (
        <MarketplacesSection organizationId="org-1" />
      ) : (
        <DeveloperModeSection organizationId="org-1" />
      )}
    </QueryClientProvider>
  );
  return { ...view, client };
}

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
});

describe("DeveloperModeSection", () => {
  it("keeps controls hidden until enabling is confirmed and saved", async () => {
    const user = userEvent.setup();
    api.patch.mockResolvedValue({ enabled: true });
    mount();
    const toggle = screen.getByRole("switch", { name: "Developer mode" });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByLabelText("Marketplace URL")).toBeNull();
    await user.click(toggle);
    expect(screen.getByRole("alertdialog").textContent).toContain(
      "not for production use"
    );
    expect(api.patch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.patch).not.toHaveBeenCalled();
    await user.click(toggle);
    await user.click(
      screen.getByRole("button", { name: "Enable for development" })
    );
    await waitFor(() =>
      expect(toggle.getAttribute("aria-checked")).toBe("true")
    );
    expect(screen.queryByLabelText("Marketplace URL")).toBeNull();
    expect(api.patch).toHaveBeenCalledWith(`${path}/developer-mode`, {
      body: { enabled: true },
    });
  });

  it("keeps confirmation open and controls hidden when enabling fails", async () => {
    const user = userEvent.setup();
    api.patch.mockRejectedValue(new Error("Unavailable"));
    mount();
    await waitFor(() =>
      expect(screen.getByRole("switch").hasAttribute("disabled")).toBe(false)
    );
    await user.click(screen.getByRole("switch"));
    await user.click(
      screen.getByRole("button", { name: "Enable for development" })
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Enable for development" })
          .hasAttribute("disabled")
      ).toBe(false)
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.queryByLabelText("Marketplace URL")).toBeNull();
  });

  it("disables developer mode and updates the shared settings query", async () => {
    const user = userEvent.setup();
    api.patch.mockResolvedValue({ enabled: false });
    const { client } = mount(true);
    const toggle = screen.getByRole("switch");
    await waitFor(() =>
      expect(toggle.getAttribute("aria-checked")).toBe("true")
    );
    await user.click(toggle);
    await waitFor(() =>
      expect(toggle.getAttribute("aria-checked")).toBe("false")
    );
    expect(
      client.getQueryData(["organization-developer-mode", api.baseUrl, "org-1"])
    ).toEqual({ enabled: false });
    expect(api.patch).toHaveBeenCalledWith(`${path}/developer-mode`, {
      body: { enabled: false },
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not fetch marketplaces from General when developer mode is enabled", async () => {
    mount(true);
    await waitFor(() =>
      expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
        "true"
      )
    );
    expect(
      api.get.mock.calls.every(([url]) => url === `${path}/developer-mode`)
    ).toBe(true);
    expect(screen.queryByLabelText("Marketplace URL")).toBeNull();
  });

  it("adds and removes custom marketplaces on the separate page and protects official", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue(custom);
    api.delete.mockResolvedValue({ registryId: "custom" });
    mount(true, true);
    const input = await screen.findByLabelText("Marketplace URL");
    await user.type(input, custom.location);
    await user.click(screen.getByRole("button", { name: "Add marketplace" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(path, {
        body: { url: custom.location },
      })
    );
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /^Remove / }));
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(`${path}/custom`)
    );
  });
});

it("does not overwrite a saved mode with an older in-flight read", async () => {
  const user = userEvent.setup();
  api.patch.mockResolvedValue({ enabled: true });
  const { client } = mount();
  const toggle = screen.getByRole("switch");
  await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
  let resolveRead!: (value: { enabled: boolean }) => void;
  api.get.mockImplementationOnce(
    () =>
      new Promise<{ enabled: boolean }>((resolve) => {
        resolveRead = resolve;
      })
  );
  let refetch!: Promise<void>;
  act(() => {
    refetch = client.invalidateQueries({
      queryKey: ["organization-developer-mode", api.baseUrl, "org-1"],
    });
  });
  await user.click(toggle);
  await user.click(
    screen.getByRole("button", { name: "Enable for development" })
  );
  await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
  await act(async () => {
    resolveRead({ enabled: false });
    await refetch;
  });
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(screen.queryByLabelText("Marketplace URL")).toBeNull();
});
