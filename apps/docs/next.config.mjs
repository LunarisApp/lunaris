import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX({ macro: false });

/** @type {import("next").NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  rewrites() {
    return [
      { source: "/llms.txt", destination: "/llms.mdx/llms.txt" },
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
