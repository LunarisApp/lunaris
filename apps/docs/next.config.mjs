import { createMDX } from "fumadocs-mdx/next";
import { legacyRoutes } from "./lib/legacy-routes.mjs";

const withMDX = createMDX({ macro: false });

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Keep the development badge clear of the sidebar footer controls.
  devIndicators: false,
  poweredByHeader: false,
  redirects() {
    return [
      ...Object.entries(legacyRoutes).flatMap(([from, to]) =>
        [
          [from, to],
          [`${from}.md`, `${to}.md`],
          [`/api/markdown${from}`, `/api/markdown${to}`],
        ].map(([source, destination]) => ({
          source,
          destination,
          permanent: true,
        }))
      ),
      {
        source: "/guides/llms-full.txt",
        destination: "/llms-full.txt",
        permanent: true,
      },
      {
        source: "/troubleshooting/llms-full.txt",
        destination: "/reference/llms-full.txt",
        permanent: true,
      },
    ];
  },
  rewrites() {
    return [
      { source: "/llms.txt", destination: "/llms.mdx/llms.txt" },
      {
        source: "/:locale/llms.txt",
        destination: "/llms.mdx/:locale/llms.txt",
      },
      {
        source: "/:section*/llms-full.txt",
        destination: "/llms.mdx/:section*/llms-full.txt",
      },
      { source: "/:path*.md", destination: "/llms.mdx/:path*.md" },
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

export default withMDX(nextConfig);
