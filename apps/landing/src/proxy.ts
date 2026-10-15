import { type NextRequest, NextResponse } from "next/server";
import { defaultLocale, locales } from "./i18n/config";
import { posthogApiOrigin } from "./lib/posthog-config";

function normalizeHostHostname(host: string) {
	const trimmedHost = host.trim().toLowerCase();

	if (trimmedHost.startsWith("[")) {
		const closingBracketIndex = trimmedHost.indexOf("]");

		if (closingBracketIndex !== -1) {
			return trimmedHost.slice(1, closingBracketIndex);
		}
	}

	return trimmedHost.split(":")[0] ?? trimmedHost;
}

function isLocalRequest(request: NextRequest) {
	const host = request.headers.get("host") ?? request.nextUrl.host;
	const hostname = normalizeHostHostname(host);

	return (
		hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
	);
}

function isHttpsRequest(request: NextRequest) {
	const forwardedProto = request.headers.get("x-forwarded-proto");

	if (forwardedProto) {
		return forwardedProto.split(",")[0]?.trim().toLowerCase() === "https";
	}

	return request.nextUrl.protocol === "https:";
}

function createContentSecurityPolicy(request: NextRequest) {
	const posthogOrigin = posthogApiOrigin();
	const directives = [
		"default-src 'self'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'self'",
		"object-src 'none'",
		"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		"img-src 'self' data: https:",
		"font-src 'self' https://fonts.gstatic.com",
		`connect-src 'self' https://trust-admin.lunaris.app${posthogOrigin ? ` ${posthogOrigin}` : ""}`,
		"manifest-src 'self'",
		"media-src 'self'",
	];

	if (isHttpsRequest(request) && !isLocalRequest(request)) {
		directives.push("upgrade-insecure-requests");
	}

	return directives.join("; ");
}

function withContentSecurityPolicy(
	response: NextResponse,
	request: NextRequest,
) {
	response.headers.set(
		"Content-Security-Policy",
		createContentSecurityPolicy(request),
	);
	return response;
}

export function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const isDefaultLocaleRewrite =
		request.headers.get("x-default-locale-rewrite") === "1";

	if (pathname === "/health") {
		return withContentSecurityPolicy(NextResponse.next(), request);
	}

	// Check if the pathname starts with a locale
	const pathnameHasLocale = locales.some(
		(locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
	);

	// Redirect /en/... to /... (canonical English URLs)
	if (
		pathname.startsWith(`/${defaultLocale}/`) ||
		pathname === `/${defaultLocale}`
	) {
		if (isDefaultLocaleRewrite)
			return withContentSecurityPolicy(NextResponse.next(), request);

		const newPathname = pathname.replace(`/${defaultLocale}`, "") || "/";
		const url = request.nextUrl.clone();
		url.pathname = newPathname;
		return withContentSecurityPolicy(NextResponse.redirect(url, 308), request);
	}

	if (pathnameHasLocale)
		return withContentSecurityPolicy(NextResponse.next(), request);

	// Rewrite to default locale (no visible redirect)
	const url = request.nextUrl.clone();
	url.pathname = `/${defaultLocale}${pathname}`;
	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-default-locale-rewrite", "1");

	return withContentSecurityPolicy(
		NextResponse.rewrite(url, {
			request: { headers: requestHeaders },
		}),
		request,
	);
}

export const config = {
	matcher: ["/((?!_next|img|favicon.ico|.*\\..*).*)"],
};
