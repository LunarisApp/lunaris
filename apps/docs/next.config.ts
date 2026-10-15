import type { NextConfig } from "next";
import nextra from "nextra";

const withNextra = nextra({});

const nextConfig: NextConfig = {
	poweredByHeader: false,
	turbopack: {
		resolveAlias: {
			"next-mdx-import-source-file": "./mdx-components.tsx",
		},
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
						key: "X-Content-Type-Options",
						value: "nosniff",
					},
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
					{
						key: "Permissions-Policy",
						value: "camera=(), geolocation=(), microphone=()",
					},
				],
			},
		];
	},
};

export default withNextra(nextConfig);
