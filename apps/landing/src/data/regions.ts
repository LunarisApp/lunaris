export const regionStatuses = ["planned", "available", "deprecated"] as const;

export type RegionStatus = (typeof regionStatuses)[number];

type RegionBase = {
	readonly regionId: string;
	readonly displayName: string;
};

export type PlannedRegion = RegionBase & {
	readonly status: "planned";
	readonly manifestUrl?: never;
};

export type RoutableRegion = RegionBase & {
	readonly status: "available" | "deprecated";
	readonly manifestUrl: `https://${string}`;
};

export type DataRegion = PlannedRegion | RoutableRegion;

export type RegionDirectory = {
	readonly schemaVersion: 1;
	readonly regions: readonly DataRegion[];
};

/**
 * Canonical list of official Lunaris data regions.
 *
 * Keep entries in the order they should appear in region pickers. Region IDs
 * are permanent and must never be reused. A planned region must not expose a
 * manifest URL until its regional services are ready for clients.
 */
export const regionDirectory = {
	schemaVersion: 1,
	regions: [
		{
			regionId: "us",
			displayName: "United States",
			status: "available",
			manifestUrl: "https://api-us.lunaris.app/v1/manifest",
		},
		{
			regionId: "eu",
			displayName: "European Union",
			status: "planned",
		},
	],
} as const satisfies RegionDirectory;
