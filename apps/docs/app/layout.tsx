import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteUrl } from "../lib/site";
import "@fontsource-variable/dm-sans";
import "./styles.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Lunaris Docs",
    template: "%s – Lunaris Docs",
  },
  description: "Guides and reference for using Lunaris.",
  applicationName: "Lunaris Docs",
  openGraph: {
    type: "website",
    siteName: "Lunaris Docs",
    url: siteUrl,
  },
  twitter: {
    card: "summary",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
