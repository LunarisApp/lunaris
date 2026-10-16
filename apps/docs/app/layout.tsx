import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import markOnDark from "../../../assets/brand/source/mark-on-dark.svg";
import markOnLight from "../../../assets/brand/source/mark-on-light.svg";
import "nextra-theme-docs/style.css";
import "./styles.css";

const siteUrl = "https://docs.lunaris.app";

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

const navbar = (
  <Navbar
    logo={
      <span className="lunaris-logo">
        <a className="lunaris-brand-link" href="https://lunaris.app">
          <Image
            alt=""
            aria-hidden="true"
            className="lunaris-mark lunaris-mark-light"
            height={20}
            src={markOnLight}
            width={20}
          />
          <Image
            alt=""
            aria-hidden="true"
            className="lunaris-mark lunaris-mark-dark"
            height={20}
            src={markOnDark}
            width={20}
          />
          <span>Lunaris</span>
        </a>
        <Link className="lunaris-logo-section" href="/">
          Docs
        </Link>
      </span>
    }
    logoLink={false}
  />
);

const footer = (
  <Footer>
    <span>© {new Date().getFullYear()} Lunaris.</span>
  </Footer>
);

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html dir="ltr" lang="en" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          editLink={null}
          feedback={{ content: null }}
          footer={footer}
          navbar={navbar}
          pageMap={await getPageMap()}
          sidebar={{ autoCollapse: true }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
