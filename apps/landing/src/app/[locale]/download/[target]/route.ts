import { useLogger, withEvlog } from "@/lib/evlog";
import {
	isReleaseTarget,
	ReleaseDownloadError,
	resolveReleaseDownload,
	type SignedReleaseDownload,
} from "@/lib/release-downloads";

interface RouteContext {
	params: Promise<{ locale: string; target: string }>;
}

interface DownloadLogger {
	error: (error: Error) => void;
	set: (context: Record<string, unknown>) => void;
}

interface DownloadRouteDependencies {
	log: DownloadLogger;
	resolve: (target: "cli" | "macos") => Promise<SignedReleaseDownload>;
}

const noStoreHeaders = {
	"Cache-Control": "no-store",
	"Content-Type": "text/plain; charset=utf-8",
};

function textResponse(message: string, status: number) {
	return new Response(message, {
		status,
		headers: noStoreHeaders,
	});
}

export async function handleDownload(
	_request: Request,
	{ params }: RouteContext,
	dependencies?: DownloadRouteDependencies,
): Promise<Response> {
	const { target } = await params;
	const log = dependencies?.log ?? useLogger();
	const resolve = dependencies?.resolve ?? resolveReleaseDownload;
	if (!isReleaseTarget(target)) {
		log.set({ download: { outcome: "not_found", target } });
		return textResponse("Download not found", 404);
	}

	try {
		const release = await resolve(target);
		log.set({
			download: {
				component: release.component,
				outcome: "redirect",
				signingMode: release.signingMode,
				target,
				version: release.version,
			},
		});
		return new Response(null, {
			status: 307,
			headers: {
				"Cache-Control": "no-store",
				Location: release.url,
			},
		});
	} catch (error) {
		const cause =
			error instanceof Error ? error : new Error("Unknown release error");
		const component = target === "macos" ? "desktop" : "cli";
		log.set({
			download: {
				component,
				...(error instanceof ReleaseDownloadError
					? { errorKind: error.kind }
					: {}),
				outcome: "unavailable",
				target,
			},
		});
		log.error(cause);
		return textResponse("Download temporarily unavailable", 503);
	}
}

export const GET = withEvlog((request: Request, context: RouteContext) =>
	handleDownload(request, context),
);
