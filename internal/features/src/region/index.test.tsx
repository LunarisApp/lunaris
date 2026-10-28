import { render, screen, waitFor } from "@testing-library/react";
import { log } from "evlog";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAuthCallbackUrl,
  DEFAULT_REGION_DIRECTORY_URL,
  parseRegionDirectory,
  parseRegionDiscovery,
  RegionProvider,
  useRegion,
} from "./index";

function RegionProbe() {
  const { hasExplicitRegionSelection, region, selectionRequired } = useRegion();

  return (
    <div>
      <span>{region.id}</span>
      <span>{hasExplicitRegionSelection ? "explicit" : "default"}</span>
      <span>
        {selectionRequired ? "selection-required" : "selection-ready"}
      </span>
    </div>
  );
}

function RegionManifestProbe() {
  const { error, manifest } = useRegion();

  return (
    <div>
      <span>{manifest?.regionId ?? "no-manifest"}</span>
      <span>{error?.message ?? "no-error"}</span>
    </div>
  );
}

function RegionManifestUrlProbe() {
  const { manifest } = useRegion();
  return <span>{manifest?.apiUrl ?? "no-manifest"}</span>;
}

function RegionSessionManifestProbe() {
  const { manifest, setRegion } = useRegion();
  return (
    <div>
      <span>{manifest?.apiUrl ?? "no-manifest"}</span>
      <button onClick={() => setRegion("eu")} type="button">
        Choose EU
      </button>
      <button onClick={() => setRegion("us")} type="button">
        Choose US
      </button>
    </div>
  );
}

function RegionSelectionProbe() {
  const { region, setRegion } = useRegion();

  return (
    <div>
      <span>{region.id}</span>
      <button onClick={() => setRegion("us")} type="button">
        Choose US
      </button>
    </div>
  );
}

function RegionSwitchManifestProbe() {
  const { manifest, region, setRegion } = useRegion();

  return (
    <div>
      <span data-testid="selected-region">{region.id}</span>
      <span data-testid="loaded-manifest">
        {manifest?.regionId ?? "no-manifest"}
      </span>
      <button onClick={() => setRegion("us")} type="button">
        Choose US
      </button>
    </div>
  );
}

function RegionDirectoryProbe() {
  const { regions } = useRegion();
  return (
    <span>
      {regions
        .map((region) => `${region.id}:${region.label}:${region.status}`)
        .join("|")}
    </span>
  );
}

const REGION_MANIFEST_STORAGE_KEY = "lunaris.regionManifest";
const REGION_DIRECTORY_STORAGE_KEY = "lunaris.regionDirectory";

const DISCOVERY = {
  schemaVersion: 1,
  regions: [
    {
      regionId: "us",
      displayName: "United States",
      status: "available",
      manifestUrl: "https://api-us.example.com/v1/manifest",
    },
    {
      regionId: "eu",
      displayName: "European Union",
      status: "planned",
    },
  ],
};

const US_MANIFEST = {
  apiUrl: "https://api-us.example.com",
  syncUrl: "https://sync-us.example.com",
  regionId: "us",
  storageUrl: "https://storage-us.example.com",
};

const EU_MANIFEST = {
  apiUrl: "https://api-eu.example.com",
  syncUrl: "https://sync-eu.example.com",
  regionId: "eu",
  storageUrl: "https://storage-eu.example.com",
};

const DIRECTORY = [
  {
    id: "us",
    label: "United States",
    apiUrl: "https://api-us.example.com",
    status: "active" as const,
  },
  {
    id: "eu",
    label: "Europe",
    apiUrl: "https://api-eu.example.com",
    status: "active" as const,
    default: true,
  },
];

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("parseRegionDirectory", () => {
  it("rejects duplicate ids", () => {
    expect(() =>
      parseRegionDirectory([
        {
          id: "us",
          label: "United States",
          apiUrl: "https://api-us.example.com",
          status: "active",
        },
        {
          id: "us",
          label: "Duplicate",
          apiUrl: "https://api-eu.example.com",
          status: "active",
        },
      ])
    ).toThrow("Duplicate region id: us");
  });
});

describe("parseRegionDiscovery", () => {
  it("maps well-known regions into sign-in directory entries", () => {
    expect(parseRegionDiscovery(DISCOVERY)).toEqual([
      {
        id: "us",
        label: "United States",
        manifestUrl: "https://api-us.example.com/v1/manifest",
        status: "active",
      },
      {
        id: "eu",
        label: "European Union",
        status: "coming-soon",
      },
    ]);
  });

  it("rejects unsupported discovery schema versions", () => {
    expect(() =>
      parseRegionDiscovery({ ...DISCOVERY, schemaVersion: 2 })
    ).toThrow();
  });
});

describe("createAuthCallbackUrl", () => {
  it("creates web and desktop callback URLs from injected bases", () => {
    expect(
      createAuthCallbackUrl("/auth/reset-password", "https://lunaris.app")
    ).toBe("https://lunaris.app/auth/reset-password");
    expect(createAuthCallbackUrl("/auth/reset-password", "lunaris://")).toBe(
      "lunaris:///auth/reset-password"
    );
  });
});

describe("RegionProvider", () => {
  it("discovers sign-in regions from the well-known directory", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        if (String(input) === DEFAULT_REGION_DIRECTORY_URL) {
          return Promise.resolve(
            new Response(JSON.stringify(DISCOVERY), {
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(US_MANIFEST), {
            headers: { "Content-Type": "application/json" },
          })
        );
      });

    render(
      <MemoryRouter initialEntries={["/auth?region=us"]}>
        <RegionProvider>
          <RegionDirectoryProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(
      await screen.findByText(
        "us:United States:active|eu:European Union:coming-soon"
      )
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(DEFAULT_REGION_DIRECTORY_URL, {
      credentials: "omit",
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input) === "https://api-us.example.com/v1/manifest" &&
            init?.credentials === "omit"
        )
      ).toBe(true);
    });
    expect(
      JSON.parse(localStorage.getItem(REGION_DIRECTORY_STORAGE_KEY) ?? "[]")
    ).toEqual({
      [DEFAULT_REGION_DIRECTORY_URL]: parseRegionDiscovery(DISCOVERY),
    });
  });

  it("uses cached discovery when directory fetch rejects", async () => {
    const warn = vi.spyOn(log, "warn");
    localStorage.setItem(
      REGION_DIRECTORY_STORAGE_KEY,
      JSON.stringify({
        [DEFAULT_REGION_DIRECTORY_URL]: parseRegionDiscovery(DISCOVERY),
      })
    );
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input) === DEFAULT_REGION_DIRECTORY_URL) {
        return Promise.reject(new TypeError("offline"));
      }
      return Promise.resolve(
        new Response(JSON.stringify(US_MANIFEST), {
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    render(
      <MemoryRouter initialEntries={["/auth?region=us"]}>
        <RegionProvider>
          <RegionDirectoryProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(
      await screen.findByText(
        "us:United States:active|eu:European Union:coming-soon"
      )
    ).toBeTruthy();
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "region.directory.refresh",
          outcome: "failure",
        })
      )
    );
  });

  it("boots from cached directory and manifest before refreshes settle", async () => {
    localStorage.setItem(
      REGION_DIRECTORY_STORAGE_KEY,
      JSON.stringify({
        [DEFAULT_REGION_DIRECTORY_URL]: parseRegionDiscovery(DISCOVERY),
      })
    );
    localStorage.setItem(
      REGION_MANIFEST_STORAGE_KEY,
      JSON.stringify({ us: US_MANIFEST })
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise<Response>(() => {}));

    render(
      <MemoryRouter initialEntries={["/auth?region=us"]}>
        <RegionProvider>
          <RegionManifestProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(screen.getByText("us")).toBeTruthy();
    expect(screen.getByText("no-error")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("creates clients through the injected region factory", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(US_MANIFEST), {
        headers: { "Content-Type": "application/json" },
      })
    );
    const createClients = vi.fn(() => ({
      apiClient: {} as never,
      authClient: {} as never,
    }));

    render(
      <MemoryRouter initialEntries={["/auth?region=us"]}>
        <RegionProvider createClients={createClients} directory={DIRECTORY}>
          <RegionManifestProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("us")).toBeTruthy();
    expect(createClients).toHaveBeenCalledWith(US_MANIFEST);
  });
  it("prefers query param over stored region", async () => {
    localStorage.setItem("lunaris.region", "us");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(EU_MANIFEST), {
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <MemoryRouter initialEntries={["/auth?region=eu"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("eu")).toBeTruthy();
    expect(screen.getByText("explicit")).toBeTruthy();
    await waitFor(() =>
      expect(localStorage.getItem("lunaris.region")).toBe("eu")
    );
  });

  it("falls back to stored region before default", async () => {
    localStorage.setItem("lunaris.region", "us");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(US_MANIFEST), {
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("us")).toBeTruthy();
    expect(screen.getByText("explicit")).toBeTruthy();
  });

  it("restores a switcher choice after the provider remounts", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const manifest = String(input).includes("api-us")
        ? US_MANIFEST
        : EU_MANIFEST;
      return Promise.resolve(
        new Response(JSON.stringify(manifest), {
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const first = render(
      <MemoryRouter initialEntries={["/auth"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionSelectionProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("eu")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Choose US" }));
    await waitFor(() =>
      expect(localStorage.getItem("lunaris.region")).toBe("us")
    );
    first.unmount();

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("us")).toBeTruthy();
    expect(screen.getByText("explicit")).toBeTruthy();
  });

  it("clears the previous manifest while switching regions", async () => {
    const user = userEvent.setup();
    let resolveUsManifest: ((response: Response) => void) | undefined;
    const usManifestResponse = new Promise<Response>((resolve) => {
      resolveUsManifest = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("api-us")) {
        return usManifestResponse;
      }
      return Promise.resolve(
        new Response(JSON.stringify(EU_MANIFEST), {
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionSwitchManifestProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loaded-manifest").textContent).toBe("eu")
    );
    await user.click(screen.getByRole("button", { name: "Choose US" }));
    expect(screen.getByTestId("selected-region").textContent).toBe("us");
    expect(screen.getByTestId("loaded-manifest").textContent).toBe(
      "no-manifest"
    );

    resolveUsManifest?.(
      new Response(JSON.stringify(US_MANIFEST), {
        headers: { "Content-Type": "application/json" },
      })
    );
    await waitFor(() =>
      expect(screen.getByTestId("loaded-manifest").textContent).toBe("us")
    );
  });

  it("treats configured default as satisfying selectionRequired", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(EU_MANIFEST), {
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("eu")).toBeTruthy();
    // No stored/URL choice → still labelled as default
    expect(screen.getByText("default")).toBeTruthy();
    // …but the configured default unblocks the gate
    expect(screen.getByText("selection-ready")).toBeTruthy();
  });

  it("unblocks sign-in for a single discovered region without a selector", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      Response.json(
        String(input) === DEFAULT_REGION_DIRECTORY_URL
          ? {
              schemaVersion: 1,
              regions: [
                {
                  regionId: "eu",
                  displayName: "Europe",
                  status: "available",
                  manifestUrl: "https://api-eu.example.com/v1/manifest",
                },
              ],
            }
          : EU_MANIFEST
      )
    );
    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <RegionProvider>
          <RegionProbe />
        </RegionProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("eu")).toBeTruthy();
    expect(screen.getByText("selection-ready")).toBeTruthy();
  });

  it("keeps selectionRequired when config has no explicit default", async () => {
    const directoryWithoutDefault = [
      {
        id: "us",
        label: "United States",
        apiUrl: "https://api-us.example.com",
        status: "active" as const,
      },
      {
        id: "eu",
        label: "Europe",
        apiUrl: "https://api-eu.example.com",
        status: "active" as const,
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(US_MANIFEST), {
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <RegionProvider directory={directoryWithoutDefault}>
          <RegionProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("us")).toBeTruthy();
    expect(screen.getByText("default")).toBeTruthy();
    expect(screen.getByText("selection-required")).toBeTruthy();
  });

  it("stores successful manifests in localStorage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(US_MANIFEST), {
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <MemoryRouter initialEntries={["/auth?region=us"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionManifestProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("us")).toBeTruthy();

    expect(
      JSON.parse(localStorage.getItem(REGION_MANIFEST_STORAGE_KEY) ?? "{}")
    ).toEqual({ us: US_MANIFEST });
  });

  it("uses stored manifest when manifest fetch rejects", async () => {
    localStorage.setItem(
      REGION_MANIFEST_STORAGE_KEY,
      JSON.stringify({ us: US_MANIFEST })
    );
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    render(
      <MemoryRouter initialEntries={["/auth?region=us"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionManifestProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("us")).toBeTruthy();
    expect(screen.getByText("no-error")).toBeTruthy();
  });

  it("keeps stored manifest when background refresh fails", async () => {
    const warn = vi.spyOn(log, "warn");
    localStorage.setItem(
      REGION_MANIFEST_STORAGE_KEY,
      JSON.stringify({ us: US_MANIFEST })
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    );

    render(
      <MemoryRouter initialEntries={["/auth?region=us"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionManifestProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("us")).toBeTruthy();
    expect(screen.getByText("no-error")).toBeTruthy();
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "region.manifest.refresh",
          outcome: "failure",
          region: { id: "us" },
        })
      )
    );
  });

  it("persists a refreshed manifest without swapping current clients", async () => {
    const refreshedManifest = {
      ...US_MANIFEST,
      apiUrl: "https://api-us-next.example.com",
    };
    localStorage.setItem(
      REGION_MANIFEST_STORAGE_KEY,
      JSON.stringify({ us: US_MANIFEST })
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(refreshedManifest), {
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <MemoryRouter initialEntries={["/auth?region=us"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionManifestUrlProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(US_MANIFEST.apiUrl)).toBeTruthy();
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(REGION_MANIFEST_STORAGE_KEY) ?? "{}")
      ).toEqual({ us: refreshedManifest })
    );
    expect(screen.getByText(US_MANIFEST.apiUrl)).toBeTruthy();
  });

  it("keeps the opening manifest when returning to a region this session", async () => {
    const user = userEvent.setup();
    const refreshedManifest = {
      ...US_MANIFEST,
      apiUrl: "https://api-us-next.example.com",
    };
    localStorage.setItem(
      REGION_MANIFEST_STORAGE_KEY,
      JSON.stringify({ eu: EU_MANIFEST, us: US_MANIFEST })
    );
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            String(input).includes("api-us") ? refreshedManifest : EU_MANIFEST
          ),
          { headers: { "Content-Type": "application/json" } }
        )
      )
    );

    render(
      <MemoryRouter initialEntries={["/auth?region=us"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionSessionManifestProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(US_MANIFEST.apiUrl)).toBeTruthy();
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(REGION_MANIFEST_STORAGE_KEY) ?? "{}").us
      ).toEqual(refreshedManifest)
    );
    await user.click(screen.getByRole("button", { name: "Choose EU" }));
    expect(await screen.findByText(EU_MANIFEST.apiUrl)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Choose US" }));
    expect(await screen.findByText(US_MANIFEST.apiUrl)).toBeTruthy();
    expect(screen.queryByText(refreshedManifest.apiUrl)).toBeNull();
  });

  it("ignores stored manifest with wrong regionId", async () => {
    localStorage.setItem(
      REGION_MANIFEST_STORAGE_KEY,
      JSON.stringify({ us: EU_MANIFEST })
    );
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    render(
      <MemoryRouter initialEntries={["/auth?region=us"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionManifestProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(
      await screen.findByText("Failed to fetch region manifest")
    ).toBeTruthy();
    expect(screen.getByText("no-manifest")).toBeTruthy();
  });

  it("ignores invalid stored manifest JSON", async () => {
    localStorage.setItem(REGION_MANIFEST_STORAGE_KEY, "not json");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    render(
      <MemoryRouter initialEntries={["/auth?region=us"]}>
        <RegionProvider directory={DIRECTORY}>
          <RegionManifestProbe />
        </RegionProvider>
      </MemoryRouter>
    );

    expect(
      await screen.findByText("Failed to fetch region manifest")
    ).toBeTruthy();
    expect(screen.getByText("no-manifest")).toBeTruthy();
  });
});
