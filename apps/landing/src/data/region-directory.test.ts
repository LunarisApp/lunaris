import { expect, test } from "bun:test";
import { GET } from "../app/.well-known/lunaris-regions/route";

test("publishes staging as routable but hidden", async () => {
	const response = GET(
		new Request("https://lunaris.app/.well-known/lunaris-regions"),
	);
	const directory = await response.json();
	expect(
		directory.regions.find(
			(region: { regionId: string }) => region.regionId === "staging",
		),
	).toEqual({
		regionId: "staging",
		displayName: "Staging",
		status: "available",
		manifestUrl: "https://api-staging-5a32.up.railway.app/v1/manifest",
		hidden: true,
	});
});
