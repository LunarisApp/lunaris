export const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
export const posthogApiHost = process.env.NEXT_PUBLIC_POSTHOG_API_HOST;
export const posthogUiHost = process.env.NEXT_PUBLIC_POSTHOG_UI_HOST;

export const posthogConfigured = Boolean(
	posthogKey && posthogApiHost && posthogUiHost,
);

export function posthogApiOrigin(): string | null {
	if (!posthogApiHost) return null;

	try {
		const url = new URL(posthogApiHost);
		return url.protocol === "https:" || url.protocol === "http:"
			? url.origin
			: null;
	} catch {
		return null;
	}
}
