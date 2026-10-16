import { handleRequest, applySecurityHeaders } from "../../apps/web/serve";

const value = process.env.VITE_REGION_DIRECTORY_JSON;
if (!value) {
  throw new Error(
    "Set VITE_REGION_DIRECTORY_JSON to your region directory array"
  );
}
const regions: unknown = JSON.parse(value);
if (!Array.isArray(regions) || regions.length === 0) {
  throw new Error("Region directory must be a nonempty array");
}
for (const entry of regions as unknown[]) {
  if (
    !entry ||
    typeof entry !== "object" ||
    !("id" in entry) ||
    typeof entry.id !== "string" ||
    !entry.id ||
    !("label" in entry) ||
    typeof entry.label !== "string" ||
    !entry.label ||
    !("status" in entry) ||
    entry.status !== "active" ||
    !("apiUrl" in entry) ||
    typeof entry.apiUrl !== "string" ||
    !["http:", "https:"].includes(new URL(entry.apiUrl).protocol) ||
    ("default" in entry && typeof entry.default !== "boolean")
  ) {
    throw new Error(
      "Each region needs id, label, active status, and an HTTP(S) apiUrl"
    );
  }
}
Bun.serve({
  port: Number(process.env.PORT) || 3000,
  fetch(request) {
    if (new URL(request.url).pathname === "/regions.json") {
      const response = Response.json(regions, {
        headers: { "Cache-Control": "no-store" },
      });
      applySecurityHeaders(response.headers, false);
      return response;
    }
    return handleRequest(request);
  },
});
