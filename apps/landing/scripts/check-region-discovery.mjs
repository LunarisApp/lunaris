import assert from "node:assert/strict";

const directoryUrl =
	process.env.REGION_DIRECTORY_URL ??
	"https://lunaris.app/.well-known/lunaris-regions";
const requestOrigin =
	process.env.REGION_DISCOVERY_ORIGIN ?? "https://web.lunaris.app";
const skipManifests = process.env.REGION_DISCOVERY_SKIP_MANIFESTS === "1";

const expectedCacheDirectives = [
	"public",
	"max-age=300",
	"stale-while-revalidate=86400",
];
const knownStatuses = new Set(["planned", "available", "deprecated"]);

function assertPublicDiscoveryHeaders(response, resourceName) {
	assert.match(
		response.headers.get("content-type") ?? "",
		/^application\/json(?:;|$)/i,
		`${resourceName} content type`,
	);

	const cacheControl = response.headers.get("cache-control") ?? "";
	for (const directive of expectedCacheDirectives) {
		assert.ok(
			cacheControl.includes(directive),
			`${resourceName} cache-control must include ${directive}`,
		);
	}

	assert.equal(
		response.headers.get("access-control-allow-origin"),
		"*",
		`${resourceName} CORS policy`,
	);
	assert.equal(
		response.headers.get("cross-origin-resource-policy"),
		"cross-origin",
		`${resourceName} resource policy`,
	);
	assert.equal(
		response.headers.get("access-control-allow-credentials"),
		null,
		`${resourceName} must be credentialless`,
	);
}

function assertHttpsUrl(value, fieldName) {
	assert.equal(typeof value, "string", `${fieldName} must be a string`);
	assert.equal(
		new URL(value).protocol,
		"https:",
		`${fieldName} must use HTTPS`,
	);
}

function validateDirectory(directory) {
	assert.equal(
		directory?.schemaVersion,
		1,
		"unsupported directory schemaVersion",
	);
	assert.ok(Array.isArray(directory.regions), "regions must be an array");

	const regionIds = new Set();

	for (const region of directory.regions) {
		assert.match(
			region?.regionId ?? "",
			/^[a-z0-9]+(?:-[a-z0-9]+)*$/,
			"invalid regionId",
		);
		assert.ok(
			!regionIds.has(region.regionId),
			`duplicate regionId: ${region.regionId}`,
		);
		regionIds.add(region.regionId);

		assert.equal(
			typeof region.displayName,
			"string",
			`${region.regionId} displayName must be a string`,
		);
		assert.ok(
			region.displayName.length > 0,
			`${region.regionId} displayName must not be empty`,
		);
		assert.ok(
			knownStatuses.has(region.status),
			`${region.regionId} has an unknown status`,
		);

		if (region.status === "planned") {
			assert.equal(
				"manifestUrl" in region,
				false,
				`${region.regionId} must not publish a manifestUrl while planned`,
			);
		} else {
			assertHttpsUrl(region.manifestUrl, `${region.regionId} manifestUrl`);
		}
	}

	return directory.regions;
}

async function fetchJson(url, resourceName) {
	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			Origin: requestOrigin,
		},
		redirect: "error",
	});

	assert.equal(
		response.status,
		200,
		`${resourceName} returned ${response.status}`,
	);
	assertPublicDiscoveryHeaders(response, resourceName);

	return response.json();
}

async function checkManifest(region) {
	const manifest = await fetchJson(
		region.manifestUrl,
		`${region.regionId} manifest`,
	);

	assert.equal(
		manifest?.schemaVersion,
		1,
		`${region.regionId} manifest schemaVersion`,
	);
	assert.equal(
		manifest.regionId,
		region.regionId,
		`${region.regionId} manifest regionId`,
	);
	assertHttpsUrl(manifest.apiUrl, `${region.regionId} apiUrl`);
	assertHttpsUrl(manifest.powersyncUrl, `${region.regionId} powersyncUrl`);
	assertHttpsUrl(manifest.storageUrl, `${region.regionId} storageUrl`);
}

const directoryResponse = await fetch(directoryUrl, {
	headers: {
		Accept: "application/json",
		Origin: requestOrigin,
	},
	redirect: "error",
});

assert.equal(
	directoryResponse.status,
	200,
	`directory returned ${directoryResponse.status}`,
);
assertPublicDiscoveryHeaders(directoryResponse, "directory");

const etag = directoryResponse.headers.get("etag");
assert.ok(etag, "directory must return an ETag");

const directory = await directoryResponse.json();
const regions = validateDirectory(directory);

const headResponse = await fetch(directoryUrl, {
	method: "HEAD",
	headers: { Origin: requestOrigin },
	redirect: "error",
});
assert.equal(
	headResponse.status,
	200,
	`directory HEAD returned ${headResponse.status}`,
);
assert.equal(
	await headResponse.text(),
	"",
	"directory HEAD must not return a body",
);
assertPublicDiscoveryHeaders(headResponse, "directory HEAD");

const notModifiedResponse = await fetch(directoryUrl, {
	headers: {
		"If-None-Match": etag,
		Origin: requestOrigin,
	},
	redirect: "error",
});
assert.equal(
	notModifiedResponse.status,
	304,
	`conditional directory request returned ${notModifiedResponse.status}`,
);

if (!skipManifests) {
	await Promise.all(
		regions.filter((region) => region.status !== "planned").map(checkManifest),
	);
}

console.log(`Region discovery check passed for ${directoryUrl}`);
