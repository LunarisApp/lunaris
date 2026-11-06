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
	if (/Windows/i.test(userAgent) || /Win/i.test(platform)) return "windows";
	if (/Mac/i.test(platform) || /Macintosh/i.test(userAgent)) return "macos";
	if (/Linux/i.test(userAgent) || /Linux/i.test(platform)) return "linux";
	return null;
}
