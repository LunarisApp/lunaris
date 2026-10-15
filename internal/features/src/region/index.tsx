import { GlobalIcon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { type AuthClient, createAuthClient } from "@repo/auth/client";
import { type ApiClient, createApiClient } from "@repo/data/http";
import { LoaderView } from "@repo/features/loading";
import { usePlatform } from "@repo/platform";
import { log, parseError } from "evlog";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { z } from "zod";

const REGION_QUERY_PARAM = "region";
const STORAGE_KEY = "lunaris.region";
const MANIFEST_STORAGE_KEY = "lunaris.regionManifest";
const DIRECTORY_STORAGE_KEY = "lunaris.regionDirectory";

export const DEFAULT_REGION_DIRECTORY_URL =
  "https://lunaris.app/.well-known/lunaris-regions";

const regionDirectoryEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  apiUrl: z.string().url().optional(),
  manifestUrl: z.string().url().optional(),
  status: z.enum(["active", "coming-soon"]),
  default: z.boolean().optional(),
}).superRefine((entry, ctx) => {
  if (entry.status === "active" && !entry.apiUrl && !entry.manifestUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Active region ${entry.id} requires a manifest URL`,
    });
  }
});

const discoveredRegionSchema = z.discriminatedUnion("status", [
  z.object({
    regionId: z.string().min(1),
    displayName: z.string().min(1),
    status: z.literal("available"),
    manifestUrl: z.string().url(),
  }),
  z.object({
    regionId: z.string().min(1),
    displayName: z.string().min(1),
    status: z.literal("planned"),
  }),
]);

const regionDiscoverySchema = z.object({
  schemaVersion: z.literal(1),
  regions: z.array(discoveredRegionSchema),
});

const regionManifestSchema = z.object({
  signupsAllowed: z.boolean().optional(),
  capabilities: z.object({ passwordResetEmail: z.boolean().optional() }).optional(),
  socialProviders: z.array(z.string()).optional(),
  apiUrl: z.string().url(),
  syncUrl: z.string().url(),
  regionId: z.string().min(1),
  storageUrl: z.string().url(),
});

export type RegionDirectoryEntry = z.infer<typeof regionDirectoryEntrySchema>;
export type RegionManifest = z.infer<typeof regionManifestSchema>;

export type RegionClientFactory = (manifest: RegionManifest) => {
  apiClient: ApiClient;
  authClient: AuthClient;
};

interface RegionProviderProps {
  authCallbackBaseUrl?: string;
  children: ReactNode;
  createClients?: RegionClientFactory;
  directory?: RegionDirectoryEntry[];
  directoryUrl?: string;
}

interface RegionContextValue {
  apiClient: ApiClient | null;
  authClient: AuthClient | null;
  authUrl: (path: string) => string;
  error: Error | null;
  hasExplicitRegionSelection: boolean;
  isLoading: boolean;
  manifest: RegionManifest | null;
  pathWithRegion: (path: string) => string;
  region: RegionDirectoryEntry;
  regions: RegionDirectoryEntry[];
  selectionRequired: boolean;
  setRegion: (regionId: string) => void;
  urlWithRegion: (url: string) => string;
}

type RegionClients = Pick<
  RegionContextValue,
  "apiClient" | "authClient" | "error" | "isLoading" | "manifest"
>;

const RegionContext = createContext<RegionContextValue | null>(null);

class ManifestFetchNetworkError extends Error {
  constructor(cause: unknown) {
    super("Failed to fetch region manifest");
    this.name = "ManifestFetchNetworkError";
    this.cause = cause;
  }
}

class DirectoryFetchNetworkError extends Error {
  constructor(cause: unknown) {
    super("Failed to fetch region directory");
    this.name = "DirectoryFetchNetworkError";
    this.cause = cause;
  }
}

function resolveDefaultRegion(directory: RegionDirectoryEntry[]) {
  const explicitDefault = directory.find((entry) => entry.default);
  const fallbackDefault = directory.find((entry) => entry.status === "active");
  const region = explicitDefault ?? fallbackDefault;

  if (!region) {
    throw new Error("Region directory requires at least one active region");
  }

  if (region.status !== "active") {
    throw new Error("Default region must be active");
  }

  return region;
}

function resolveRegion(
  directory: RegionDirectoryEntry[],
  regionId: string | null | undefined,
) {
  if (!regionId) return null;
  const region = directory.find((entry) => entry.id === regionId) ?? null;
  if (!region || region.status !== "active") return null;
  return region;
}

function createRegionUrl(input: string) {
  return new URL(input, "https://lunaris.app");
}

export function createRegionSearch(regionId?: string) {
  if (!regionId) return "";
  const params = new URLSearchParams();
  params.set(REGION_QUERY_PARAM, regionId);
  return `?${params.toString()}`;
}

export function appendRegionToPath(path: string, regionId?: string) {
  if (!regionId) return path;
  const url = createRegionUrl(path);
  url.searchParams.set(REGION_QUERY_PARAM, regionId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function appendRegionToUrl(url: string, regionId?: string) {
  if (!regionId) return url;
  const resolvedUrl = new URL(url);
  resolvedUrl.searchParams.set(REGION_QUERY_PARAM, regionId);
  return resolvedUrl.toString();
}

export function createAuthCallbackUrl(path: string, baseUrl: string) {
  return new URL(path, baseUrl).toString();
}

export function parseRegionDirectory(value: unknown) {
  const schema = z.array(regionDirectoryEntrySchema).superRefine((entries, ctx) => {
    const ids = new Set<string>();
    let defaults = 0;

    for (const entry of entries) {
      if (ids.has(entry.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate region id: ${entry.id}`,
        });
      }
      ids.add(entry.id);
      if (entry.default) defaults += 1;
    }

    if (defaults > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only one region can be default",
      });
    }

    if (!entries.some((entry) => entry.status === "active")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one active region is required",
      });
    }
  });

  return schema.parse(value);
}

export function parseRegionDiscovery(value: unknown) {
  const discovery = regionDiscoverySchema.parse(value);
  return parseRegionDirectory(
    discovery.regions.map((entry) => ({
      id: entry.regionId,
      label: entry.displayName,
      status: entry.status === "available" ? "active" : "coming-soon",
      ...(entry.status === "available"
        ? { manifestUrl: entry.manifestUrl }
        : {}),
    })),
  );
}

async function fetchRegionDirectory(directoryUrl: string) {
  let response: Response;
  try {
    response = await fetch(directoryUrl, { credentials: "omit" });
  } catch (error) {
    throw new DirectoryFetchNetworkError(error);
  }

  if (!response.ok) {
    throw new Error(`Region directory request failed: ${response.status}`);
  }

  return parseRegionDiscovery(await response.json());
}

async function fetchManifest(
  expectedRegionId: string,
  region: RegionDirectoryEntry,
) {
  // Public @AllowAnonymous endpoint — deliberately no credentials so
  // we never send Better Auth cookies cross-origin during region probing.
  let response: Response;
  try {
    const manifestUrl = region.manifestUrl
      ? new URL(region.manifestUrl)
      : new URL("/v1/manifest", region.apiUrl);
    response = await fetch(manifestUrl, { credentials: "omit" });
  } catch (error) {
    throw new ManifestFetchNetworkError(error);
  }

  if (!response.ok) {
    throw new Error(`Manifest request failed: ${response.status}`);
  }

  const manifest = regionManifestSchema.parse(await response.json());

  // Refuse mismatched regions: a backend misconfig or proxy misroute
  // must not silently redirect user data to the wrong jurisdiction.
  if (manifest.regionId !== expectedRegionId) {
    throw new Error(
      `Manifest region mismatch: expected ${expectedRegionId}, got ${manifest.regionId}`,
    );
  }

  return manifest;
}

function readStoredDirectory(directoryUrl: string) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(DIRECTORY_STORAGE_KEY);
    if (!raw) return null;

    const records = JSON.parse(raw) as unknown;
    if (!records || typeof records !== "object" || Array.isArray(records)) {
      return null;
    }

    return parseRegionDirectory(
      (records as Record<string, unknown>)[directoryUrl],
    );
  } catch {
    return null;
  }
}

function writeStoredDirectory(
  directoryUrl: string,
  directory: RegionDirectoryEntry[],
) {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(DIRECTORY_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const records =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};

    records[directoryUrl] = directory;
    window.localStorage.setItem(
      DIRECTORY_STORAGE_KEY,
      JSON.stringify(records),
    );
  } catch {
    // Best effort only. Network directory remains source of truth.
  }
}

function readStoredManifest(regionId: string) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(MANIFEST_STORAGE_KEY);
    if (!raw) return null;

    const records = JSON.parse(raw) as unknown;
    if (!records || typeof records !== "object" || Array.isArray(records)) {
      return null;
    }

    const parsed = regionManifestSchema.safeParse(
      (records as Record<string, unknown>)[regionId],
    );
    if (!parsed.success || parsed.data.regionId !== regionId) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeStoredManifest(regionId: string, manifest: RegionManifest) {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(MANIFEST_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const records =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};

    records[regionId] = manifest;
    window.localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Best effort only. Network manifest remains source of truth.
  }
}

const defaultCreateClients: RegionClientFactory = (manifest) => ({
  apiClient: createApiClient(manifest.apiUrl),
  authClient: createAuthClient({ baseURL: manifest.apiUrl }),
});

function ResolvedRegionProvider({
  authCallbackBaseUrl,
  children,
  createClients = defaultCreateClients,
  directory,
}: RegionProviderProps & { directory: RegionDirectoryEntry[] }) {
  const { navigation } = usePlatform();
  const location = useLocation();
  const navigate = useNavigate();
  const cacheRef = useRef(new Map<string, RegionManifest>());
  const [storedRegionId, setStoredRegionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });
  const regions = directory;
  const defaultRegion = useMemo(() => resolveDefaultRegion(regions), [regions]);
  const hasConfiguredDefault = useMemo(
    () => regions.some((entry) => entry.default === true),
    [regions],
  );
  const queryRegionId = useMemo(
    () => new URLSearchParams(location.search).get(REGION_QUERY_PARAM),
    [location.search],
  );
  const queryRegion = useMemo(
    () => resolveRegion(regions, queryRegionId),
    [regions, queryRegionId],
  );
  const storedRegion = useMemo(
    () => resolveRegion(regions, storedRegionId),
    [regions, storedRegionId],
  );
  const region = queryRegion ?? storedRegion ?? defaultRegion;
  const hasExplicitRegionSelection = Boolean(queryRegion ?? storedRegion);
  const [manifest, setManifest] = useState<RegionManifest | null>(() =>
    readStoredManifest(region.id),
  );
  const [isLoading, setIsLoading] = useState(() => manifest === null);
  const [error, setError] = useState<Error | null>(null);
  const activeManifest = manifest?.regionId === region.id ? manifest : null;

  useEffect(() => {
    if (!queryRegion) return;
    if (storedRegionId === queryRegion.id) return;
    window.localStorage.setItem(STORAGE_KEY, queryRegion.id);
    setStoredRegionId(queryRegion.id);
  }, [queryRegion, storedRegionId]);

  useEffect(() => {
    let cancelled = false;
    const cached =
      cacheRef.current.get(region.id) ?? readStoredManifest(region.id);

    if (cached) {
      cacheRef.current.set(region.id, cached);
      setManifest(cached);
      setIsLoading(false);
      setError(null);
    } else {
      setIsLoading(true);
      setManifest(null);
      setError(null);
    }

    fetchManifest(region.id, region)
      .then((nextManifest) => {
        if (cancelled) return;
        writeStoredManifest(region.id, nextManifest);
        // A validated cached manifest owns this app session. Persist refreshes
        // for the next open instead of tearing down active auth/sync clients.
        if (!cached) {
          cacheRef.current.set(region.id, nextManifest);
          setManifest(nextManifest);
        }
      })
      .catch((nextError) => {
        if (cancelled) return;
        if (cached) {
          log.warn({
            action: "region.manifest.refresh",
            error: parseError(nextError),
            outcome: "failure",
            region: { id: region.id },
          });
          return;
        }

        setManifest(null);
        setError(
          nextError instanceof Error
            ? nextError
            : new Error("Failed to load region manifest"),
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [region]);

  const setRegion = useCallback(
    (regionId: string) => {
      const nextRegion = resolveRegion(regions, regionId);
      if (!nextRegion || nextRegion.status !== "active") return;

      window.localStorage.setItem(STORAGE_KEY, nextRegion.id);
      setStoredRegionId(nextRegion.id);

      const params = new URLSearchParams(location.search);
      params.set(REGION_QUERY_PARAM, nextRegion.id);
      navigate(
        {
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : "",
        },
        { replace: true },
      );
    },
    [regions, location.pathname, location.search, navigate],
  );

  const pathWithRegion = useCallback(
    (path: string) => appendRegionToPath(path, region.id),
    [region.id],
  );
  const urlWithRegion = useCallback(
    (url: string) => appendRegionToUrl(url, region.id),
    [region.id],
  );

  const authUrl = useCallback(
    (path: string) =>
      createAuthCallbackUrl(
        path,
        authCallbackBaseUrl ?? navigation.origin(),
      ),
    [authCallbackBaseUrl, navigation],
  );
  const clients = useMemo(
    () => (activeManifest ? createClients(activeManifest) : null),
    [activeManifest, createClients],
  );
  const authClient = clients?.authClient ?? null;
  const apiClient = clients?.apiClient ?? null;

  const value = useMemo<RegionContextValue>(
    () => ({
      apiClient,
      authClient,
      authUrl,
      error,
      hasExplicitRegionSelection,
      isLoading,
      manifest: activeManifest,
      pathWithRegion,
      region,
      regions,
      selectionRequired: !(hasExplicitRegionSelection || hasConfiguredDefault),
      setRegion,
      urlWithRegion,
    }),
    [
      apiClient,
      authClient,
      authUrl,
      error,
      hasConfiguredDefault,
      hasExplicitRegionSelection,
      isLoading,
      activeManifest,
      pathWithRegion,
      region,
      regions,
      setRegion,
      urlWithRegion,
    ],
  );

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function RegionProvider({
  directory,
  directoryUrl = DEFAULT_REGION_DIRECTORY_URL,
  ...props
}: RegionProviderProps) {
  const [discoveredDirectory, setDiscoveredDirectory] =
    useState<RegionDirectoryEntry[] | null>(() =>
      directory ?? readStoredDirectory(directoryUrl),
    );
  const [directoryError, setDirectoryError] = useState<Error | null>(null);

  useEffect(() => {
    if (directory) {
      setDiscoveredDirectory(directory);
      setDirectoryError(null);
      return;
    }

    let cancelled = false;
    const cachedDirectory = readStoredDirectory(directoryUrl);
    setDirectoryError(null);

    fetchRegionDirectory(directoryUrl)
      .then((nextDirectory) => {
        if (cancelled) return;
        writeStoredDirectory(directoryUrl, nextDirectory);
        // Keep boot clients stable. A refresh replaces cache for next open.
        if (!cachedDirectory) setDiscoveredDirectory(nextDirectory);
      })
      .catch((error) => {
        if (cancelled) return;
        if (cachedDirectory) {
          log.warn({
            action: "region.directory.refresh",
            directory: { url: directoryUrl },
            error: parseError(error),
            outcome: "failure",
          });
          return;
        }

        setDirectoryError(
          error instanceof Error
            ? error
            : new Error("Failed to load region directory"),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [directory, directoryUrl]);

  if (directoryError) throw directoryError;
  if (!discoveredDirectory) return <LoaderView />;

  return <ResolvedRegionProvider {...props} directory={discoveredDirectory} />;
}

export function RegionReady({ children }: { children: ReactNode }) {
  const region = useRegion();
  if (region.isLoading && !region.manifest) return <LoaderView />;
  if (region.error) throw region.error;
  if (!region.authClient || !region.apiClient || !region.manifest) {
    return <LoaderView />;
  }
  return children;
}

export function useOptionalRegion() {
  return useContext(RegionContext);
}

export function useRegion() {
  const context = useOptionalRegion();
  if (!context) {
    throw new Error("useRegion must be used within a RegionProvider");
  }
  return context;
}

export function useRegionManifest() {
  return useRegion().manifest;
}

export function useRegionClients(): RegionClients {
  const region = useRegion();
  return {
    apiClient: region.apiClient,
    authClient: region.authClient,
    error: region.error,
    isLoading: region.isLoading,
    manifest: region.manifest,
  };
}

export function RegionSummary({ variant = "card" }: { variant?: "card" | "plain" }) {
  const { t } = useTranslation();
  const { region } = useRegion();

  if (variant === "plain") {
    return (
      <section className="grid gap-3 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-center lg:gap-10">
        <h2 className="text-base font-semibold">
          {t("settings.account.region")}
        </h2>
        <div className="flex min-w-0 max-w-3xl items-center gap-3">
          <HugeiconsIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
            icon={GlobalIcon}
            strokeWidth={2}
          />
          <span className="min-w-0 text-sm">
            <span className="font-semibold">{region.label}</span>{" "}
            <span className="text-muted-foreground text-xs">
              ({region.id.toUpperCase()})
            </span>
          </span>
        </div>
      </section>
    );
  }

  return (
    <div className="bg-muted/50 flex items-center gap-3 rounded-xl px-4 py-3">
      <span className="flex items-center gap-3">
        <HugeiconsIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground"
          icon={GlobalIcon}
          strokeWidth={2}
        />
        <span className="text-sm font-medium">
          {t("settings.account.region")}
        </span>
      </span>
      <span className="ml-auto text-right text-sm">
        <span className="font-bold">{region.label}</span>{" "}
        <span className="text-xs text-muted-foreground">({region.id.toUpperCase()})</span>
      </span>
    </div>
  );
}
