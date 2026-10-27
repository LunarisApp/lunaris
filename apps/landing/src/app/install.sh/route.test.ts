import { expect, test } from "bun:test";
import { installerUrl } from "@/lib/self-host-installer";
import { handleInstaller } from "./route";

function dependencies() {
	const errors: Error[] = [];
	return {
		errors,
		versioned: async (version: string) => installerUrl(version),
		log: {
			set: (_event: Record<string, unknown>) => {},
			error: (error: Error) => {
				errors.push(error);
			},
		},
		latest: async () =>
			"https://github.com/LunarisApp/lunaris/releases/download/self-hosted%401.2.3/install.sh",
	};
}

test("remote installer redirects latest and pinned versions outside locale routing", async () => {
	const state = dependencies();
	const latest = await handleInstaller(
		new Request("https://lunaris.app/install.sh"),
		state,
	);
	expect(latest.status).toBe(307);
	expect(latest.headers.get("Location")).toContain(
		"self-hosted%401.2.3/install.sh",
	);
	const pinned = await handleInstaller(
		new Request("https://lunaris.app/install.sh?version=1.0.0"),
		{
			...state,
			latest: () => {
				throw new Error("must not resolve latest");
			},
		},
	);
	expect(pinned.status).toBe(307);
	expect(pinned.headers.get("Location")).toContain(
		"self-hosted%401.0.0/install.sh",
	);
});

test("invalid versions and unavailable releases fail as plain HTTP errors", async () => {
	const state = dependencies();
	const invalid = await handleInstaller(
		new Request("https://lunaris.app/install.sh?version=latest%0Abad"),
		state,
	);
	expect(invalid.status).toBe(400);
	const unavailable = await handleInstaller(
		new Request("https://lunaris.app/install.sh"),
		{ ...state, latest: () => Promise.reject(new Error("GitHub unavailable")) },
	);
	expect(unavailable.status).toBe(503);
	expect(unavailable.headers.get("Content-Type")).toContain("text/plain");
	expect(unavailable.headers.get("Cache-Control")).toBe("no-store");
	expect(state.errors).toHaveLength(1);
});
