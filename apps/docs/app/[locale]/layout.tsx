import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { docsCopy, i18n } from "../../lib/i18n";
import { defaultLocale, isLocale, localePath } from "../../lib/locale";
import { siteUrl } from "../../lib/site";
import { source } from "../../lib/source";
import { BrandNavigation } from "./brand-navigation";
import { Providers } from "./providers";
import { SidebarFooter } from "./sidebar-footer";
import "@fontsource-variable/dm-sans";
import "../styles.css";

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

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  if (locale === defaultLocale) {
    // Prerendering sees /en, but the sidebar must match public English URLs.
    await connection();
  }

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <Providers i18n={i18n.provider(locale)} locale={locale}>
          <DocsLayout
            i18n={false}
            links={[
              {
                type: "custom",
                children: (
                  <a
                    className={buttonVariants({
                      variant: "primary",
                      className: "h-9 whitespace-nowrap px-4 py-0",
                    })}
                    href={`https://lunaris.app${localePath(locale, "/downloads")}`}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {docsCopy[locale].getStarted}
                  </a>
                ),
              },
            ]}
            nav={{ title: BrandNavigation }}
            sidebar={{ footer: SidebarFooter }}
            themeSwitch={{ enabled: false }}
            tree={source.getPageTree(locale)}
          >
            {children}
          </DocsLayout>
        </Providers>
      </body>
    </html>
  );
}
