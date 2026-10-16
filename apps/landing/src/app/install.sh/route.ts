import { useLogger, withEvlog } from "@/lib/evlog";
import { installerUrl, latestInstallerUrl } from "@/lib/self-host-installer";

interface Dependencies {
	latest: () => Promise<string>;
	log: {
		set: (context: Record<string, unknown>) => void;
		error: (error: Error) => void;
	};
}

export async function handleInstaller(
	request: Request,
	dependencies?: Dependencies,
) {
	const version = new URL(request.url).searchParams.get("version");
	const log = dependencies?.log ?? useLogger();
	if (version !== null && !/^\d+\.\d+\.\d+$/.test(version)) {
		log.set({ installer: { outcome: "invalid_version" } });
		return new Response("Invalid self-hosted version\n", {
			status: 400,
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": "text/plain; charset=utf-8",
			},
		});
	}
	try {
		const url =
			version === null
				? await (dependencies?.latest ?? latestInstallerUrl)()
				: installerUrl(version);
		log.set({
			installer: { outcome: "redirect", version: version ?? "latest" },
		});
		return new Response(null, {
			status: 307,
			headers: { Location: url, "Cache-Control": "public, max-age=60" },
		});
	} catch (error) {
		log.set({ installer: { outcome: "unavailable" } });
		log.error(
			error instanceof Error ? error : new Error("Installer resolution failed"),
		);
		return new Response(
			"Self-hosted installer temporarily unavailable. Retry shortly.\n",
			{
				status: 503,
				headers: {
					"Cache-Control": "no-store",
					"Content-Type": "text/plain; charset=utf-8",
					"Retry-After": "60",
				},
			},
		);
	}
}

export const GET = withEvlog((request: Request) => handleInstaller(request));
