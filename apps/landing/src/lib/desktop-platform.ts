export type DesktopPlatform = "macos" | "windows" | "linux";

export const desktopPlatforms = [
	{ target: "macos", label: "macOS" },
	{ target: "windows", label: "Windows (x64)" },
	{ target: "linux", label: "Linux (.deb, x64)" },
] as const;

export function detectDesktopPlatform({
	userAgent,
	platform,
	maxTouchPoints,
}: {
	userAgent: string;
	platform: string;
	maxTouchPoints: number;
}): DesktopPlatform | null {
	// iPadOS can report a desktop Mac user agent. ChromeOS has no installer.
	if (
		/Android|iPhone|iPad|iPod|CrOS|Mobile/i.test(userAgent) ||
		(/Mac/i.test(platform) && maxTouchPoints > 1)
	)
		return null;
	if (/Windows/i.test(userAgent) || /Win/i.test(platform)) {
		// Win32 is also reported on 64-bit Windows; use the user agent's
		// architecture markers. ARM64 Windows can run the x64 installer.
		return /Win64|WOW64|x64|amd64|arm64|aarch64/i.test(
			`${userAgent} ${platform}`,
		)
			? "windows"
			: null;
	}
	if (/Mac/i.test(platform) || /Macintosh/i.test(userAgent)) return "macos";
	if (/Linux/i.test(userAgent) || /Linux/i.test(platform)) {
		// The only Linux installer we publish is x86_64. Unknown architectures
		// use the platform picker instead of recommending an incompatible binary.
		return /x86_64|amd64/i.test(`${userAgent} ${platform}`) ? "linux" : null;
	}
	return null;
}
