import type { NextConfig } from "next";
import {
	llmsIndexPath,
	markdownPages,
	markdownPath,
} from "./src/data/landing-pages";
import { locales } from "./src/i18n/config";
import { localePath } from "./src/i18n/locale-path";
import {
	legalDocumentPaths,
	legalDocumentUrls,
} from "./src/lib/legal-document-links";
import { posthogApiOrigin } from "./src/lib/posthog-config";

const posthogOrigin = posthogApiOrigin();

const markdownRewrites = markdownPages.map(({ path }) => {
	const source = markdownPath(path);
	return { source, destination: `/markdown${source}` };
});

const contentSecurityPolicy = [
	"default-src 'self'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'self'",
	"object-src 'none'",
	`script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"img-src 'self' data: https:",
	"font-src 'self' https://fonts.gstatic.com",
	`connect-src 'self'${posthogOrigin ? ` ${posthogOrigin}` : ""}`,
	"manifest-src 'self'",
	"media-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
	experimental: {
		globalNotFound: true,
	},
	poweredByHeader: false,
	async rewrites() {
		return markdownRewrites;
	},
	async redirects() {
		return [
			// Redirect direct requests to the rewrite destinations to the public URLs.
			...markdownRewrites.map(({ source, destination }) => ({
				source: destination,
				destination: source,
				permanent: true,
			})),
			{
				source: "/install.sh",
				destination: "/self-hosted/install.sh",
				permanent: true,
			},
			{
				source: legalDocumentPaths.privacy,
				destination: legalDocumentUrls.privacy,
				permanent: true,
			},
			{
				source: `/:locale(en|de|es|fr|pt-BR)${legalDocumentPaths.privacy}`,
				destination: legalDocumentUrls.privacy,
				permanent: true,
			},
			{
				source: "/policy",
				destination: legalDocumentUrls.privacy,
				permanent: true,
			},
			{
				source: "/:locale(en|de|es|fr|pt-BR)/policy",
				destination: legalDocumentUrls.privacy,
				permanent: true,
			},
			{
				source: "/privacy",
				destination: legalDocumentUrls.privacy,
				permanent: true,
			},
			{
				source: "/:locale(en|de|es|fr|pt-BR)/privacy",
				destination: legalDocumentUrls.privacy,
				permanent: true,
			},
			{
				source: legalDocumentPaths.cookies,
				destination: legalDocumentUrls.cookies,
				permanent: true,
			},
			{
				source: `/:locale(en|de|es|fr|pt-BR)${legalDocumentPaths.cookies}`,
				destination: legalDocumentUrls.cookies,
				permanent: true,
			},
			{
				source: "/cookies",
				destination: legalDocumentUrls.cookies,
				permanent: true,
			},
			{
				source: "/:locale(en|de|es|fr|pt-BR)/cookies",
				destination: legalDocumentUrls.cookies,
				permanent: true,
			},
			{
				source: legalDocumentPaths.terms,
				destination: legalDocumentUrls.terms,
				permanent: true,
			},
			{
				source: `/:locale(en|de|es|fr|pt-BR)${legalDocumentPaths.terms}`,
				destination: legalDocumentUrls.terms,
				permanent: true,
			},
			{
				source: "/tos",
				destination: legalDocumentUrls.terms,
				permanent: true,
			},
			{
				source: "/:locale(en|de|es|fr|pt-BR)/tos",
				destination: legalDocumentUrls.terms,
				permanent: true,
			},
			{
				source: "/subprocessors",
				destination: legalDocumentUrls.subprocessors,
				permanent: true,
			},
			{
				source: "/:locale(en|de|es|fr|pt-BR)/subprocessors",
				destination: legalDocumentUrls.subprocessors,
				permanent: true,
			},
		];
	},
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{
						key: "Strict-Transport-Security",
						value: "max-age=31536000; includeSubDomains",
					},
					{
						key: "X-Frame-Options",
						value: "SAMEORIGIN",
					},
					{
						key: "X-Content-Type-Options",
						value: "nosniff",
					},
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
					{
						key: "Permissions-Policy",
						value:
							"camera=(), geolocation=(), microphone=(), browsing-topics=()",
					},
					{
						key: "Content-Security-Policy",
						value: contentSecurityPolicy,
					},
				],
			},
			{
				source:
					"/:product(cli|self-hosted)/:installer(install\\.sh|install\\.ps1)",
				headers: [{ key: "Content-Type", value: "text/plain; charset=utf-8" }],
			},
			...markdownPages.flatMap(({ path }) =>
				locales.map((locale) => ({
					source: localePath(locale, path),
					headers: [
						{
							key: "Link",
							value: `<${markdownPath(path)}>; rel="alternate"; type="text/markdown"; hreflang="en", <${llmsIndexPath(path)}>; rel="describedby"`,
						},
					],
				})),
			),
		];
	},
};

export default nextConfig;
