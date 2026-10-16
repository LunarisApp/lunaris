import * as z from "zod";
import { type Fetcher, LunarisApiError } from "./cloud-client";

export const DEFAULT_REGION_DIRECTORY_URL =
  "https://lunaris.app/.well-known/lunaris-regions";

const regionSchema = z.discriminatedUnion("status", [
  z.object({
    displayName: z.string().min(1),
    manifestUrl: z.string().url(),
    regionId: z.string().min(1),
    status: z.literal("available"),
  }),
  z.object({
    displayName: z.string().min(1),
    manifestUrl: z.string().url().optional(),
    regionId: z.string().min(1),
    status: z.literal("planned"),
  }),
]);

const regionManifestSchema = z.object({
  apiUrl: z.string().url(),
  regionId: z.string().min(1),
});

export const regionDirectorySchema = z
  .object({
    regions: z.array(regionSchema).min(1),
    schemaVersion: z.literal(1),
  })
  .superRefine((directory, context) => {
    const ids = new Set<string>();
    for (const [index, region] of directory.regions.entries()) {
      if (ids.has(region.regionId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate region ID: ${region.regionId}`,
          path: ["regions", index, "regionId"],
        });
      }
      ids.add(region.regionId);
    }
  });

export type Region = z.infer<typeof regionSchema>;
export type RegionDirectory = z.infer<typeof regionDirectorySchema>;
export type AvailableRegion = Extract<Region, { status: "available" }>;
export type RegionManifest = z.infer<typeof regionManifestSchema>;

export interface RegionDiscoveryOptions {
  directoryUrl?: string;
  fetch?: Fetcher;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function discoverRegions(
  options: RegionDiscoveryOptions = {}
): Promise<RegionDirectory> {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  let response: Response;
  try {
    response = await fetcher(
      new URL(options.directoryUrl ?? DEFAULT_REGION_DIRECTORY_URL),
      { headers: { Accept: "application/json" }, signal }
    );
  } catch (cause) {
    const error = new LunarisApiError(
      "Unable to connect to the Lunaris region directory",
      0,
      "REGION_DISCOVERY_UNAVAILABLE"
    );
    error.cause = cause;
    throw error;
  }

  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new LunarisApiError(
      `Lunaris region directory returned ${response.status}`,
      response.status,
      "REGION_DISCOVERY_FAILED"
    );
  }

  const parsed = regionDirectorySchema.safeParse(payload);
  if (!parsed.success) {
    throw new LunarisApiError(
      "Lunaris region directory returned an invalid response",
      502,
      "INVALID_REGION_DIRECTORY",
      parsed.error.issues
    );
  }
  return parsed.data;
}

export async function discoverRegionManifest(
  region: AvailableRegion,
  options: Omit<RegionDiscoveryOptions, "directoryUrl"> = {}
): Promise<RegionManifest> {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  let response: Response;
  try {
    response = await fetcher(new URL(region.manifestUrl), {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (cause) {
    const error = new LunarisApiError(
      `Unable to connect to the ${region.displayName} region manifest`,
      0,
      "REGION_MANIFEST_UNAVAILABLE"
    );
    error.cause = cause;
    throw error;
  }

  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new LunarisApiError(
      `${region.displayName} region manifest returned ${response.status}`,
      response.status,
      "REGION_MANIFEST_FAILED"
    );
  }

  const parsed = regionManifestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new LunarisApiError(
      `${region.displayName} region manifest returned an invalid response`,
      502,
      "INVALID_REGION_MANIFEST",
      parsed.error.issues
    );
  }
  if (parsed.data.regionId !== region.regionId) {
    throw new LunarisApiError(
      `Region manifest mismatch: expected ${region.regionId}, got ${parsed.data.regionId}`,
      502,
      "REGION_MANIFEST_MISMATCH"
    );
  }
  return parsed.data;
}
