export function GET() {
	return new Response("ok", {
		status: 200,
		headers: {
			"Cache-Control": "no-store",
			"X-Lunaris-Commit":
				process.env.LUNARIS_BUILD_SHA ??
				process.env.RAILWAY_GIT_COMMIT_SHA ??
				"local",
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}
