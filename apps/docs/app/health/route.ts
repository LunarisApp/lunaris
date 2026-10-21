import { buildInfo } from "./build-info";

export function GET() {
  return new Response("ok", {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Lunaris-Commit": buildInfo.sha,
      "X-Lunaris-Version": buildInfo.version,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
