import { renderLlmsIndex } from "@/lib/landing-markdown";

export const dynamic = "force-static";

export function GET() {
	return new Response(renderLlmsIndex(), {
		headers: {
			"Content-Language": "en",
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}
