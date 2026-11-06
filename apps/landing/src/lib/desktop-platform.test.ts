import { expect, test } from "bun:test";
import { detectDesktopPlatform } from "./desktop-platform";

test.each([
	["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0, "macos"],
	["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", 0, "windows"],
	["Mozilla/5.0 (Windows NT 10.0)", "Win32", 0, null],
	["Mozilla/5.0 (Windows NT 10.0; WOW64)", "Win32", 0, "windows"],
	["Mozilla/5.0 (Windows NT 10.0; ARM64)", "Win32", 0, "windows"],
	["Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64", 0, "linux"],
	["Mozilla/5.0 (X11; Linux aarch64)", "Linux aarch64", 0, null],
	["Mozilla/5.0 (X11; Linux armv7l)", "Linux armv7l", 0, null],
	["Mozilla/5.0 (X11; Linux i686)", "Linux i686", 0, null],
	["Mozilla/5.0 (X11; Linux)", "Linux", 0, null],
	["Mozilla/5.0 (X11; Linux amd64)", "Linux amd64", 0, "linux"],
	["Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5, null],
	["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iPhone", 5, null],
	["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5, null],
	["Mozilla/5.0 (X11; CrOS x86_64)", "Linux x86_64", 0, null],
	["unknown", "unknown", 0, null],
] as const)(
	"detects installer for %s",
	(userAgent, platform, maxTouchPoints, expected) => {
		expect(detectDesktopPlatform({ userAgent, platform, maxTouchPoints })).toBe(
			expected,
		);
	},
);
