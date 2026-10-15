import { useLogger, withEvlog } from "@/lib/evlog";
import {
	isReleaseTarget,
	isReleaseVersion,
	ReleaseDownloadError,
	resolveVersionedReleaseDownload,
	type SignedReleaseDownload,
} from "@/lib/release-downloads";

interface RouteContext {
	params: Promise<{
		filename: string;
		target: string;
		version: string;
	}>;
}

interface DownloadLogger {
	error: (error: Error) => void;
	set: (context: Record<string, unknown>) => void;
}

interface DownloadRouteDependencies {
	log: DownloadLogger;
	resolve: (
		target: "cli" | "macos",
		version: string,
		filename: string,
	) => Promise<SignedReleaseDownload>;
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

export async function handleVersionedDownload(
	_request: Request,
	{ params }: RouteContext,
	dependencies?: DownloadRouteDependencies,
): Promise<Response> {
	const { filename, target, version } = await params;
	const log = dependencies?.log ?? useLogger();
	const resolve = dependencies?.resolve ?? resolveVersionedReleaseDownload;

	if (!isReleaseTarget(target) || !isReleaseVersion(version) || !filename) {
		log.set({
			download: {
				filename,
				outcome: "not_found",
				target,
				version,
			},
		});
		return textResponse("Download not found", 404);
	}

	try {
		const release = await resolve(target, version, filename);
		log.set({
			download: {
				component: release.component,
				filename,
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
		if (error instanceof ReleaseDownloadError && error.kind === "not_found") {
			log.set({
				download: {
					component: target === "macos" ? "desktop" : "cli",
					errorKind: error.kind,
					filename,
					outcome: "not_found",
					target,
					version,
				},
			});
			return textResponse("Download not found", 404);
		}

		const cause =
			error instanceof Error ? error : new Error("Unknown release error");
		log.set({
			download: {
				component: target === "macos" ? "desktop" : "cli",
				...(error instanceof ReleaseDownloadError
					? { errorKind: error.kind }
					: {}),
				filename,
				outcome: "unavailable",
				target,
				version,
			},
		});
		log.error(cause);
		return textResponse("Download temporarily unavailable", 503);
	}
}

export const GET = withEvlog((request: Request, context: RouteContext) =>
	handleVersionedDownload(request, context),
);
