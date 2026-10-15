import { createHash } from "node:crypto";
import { type DataRegion, regionDirectory } from "@/data/regions";

const regions: readonly DataRegion[] = regionDirectory.regions;
const body = JSON.stringify({
  schemaVersion: 1,
  servers: regions
    .filter((region) => region.status !== "deprecated")
    .map(({ regionId, ...region }) => ({ ...region, serverId: regionId })),
});
const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;

const responseHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
	"Content-Type": "application/json; charset=utf-8",
	"Cross-Origin-Resource-Policy": "cross-origin",
	ETag: etag,
};

function isNotModified(request: Request) {
	const validators = request.headers.get("if-none-match");

	if (!validators) return false;

	return validators
		.split(",")
		.map((validator) => validator.trim())
		.some(
			(validator) =>
				validator === "*" || validator.replace(/^W\//, "") === etag,
		);
}

function respond(request: Request, includeBody: boolean) {
	if (isNotModified(request)) {
		return new Response(null, {
			status: 304,
			headers: responseHeaders,
		});
	}

	return new Response(includeBody ? body : null, {
		status: 200,
		headers: responseHeaders,
	});
}

export function GET(request: Request) {
	return respond(request, true);
}

export function HEAD(request: Request) {
	return respond(request, false);
}
